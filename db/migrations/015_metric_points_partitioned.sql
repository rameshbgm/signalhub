-- metric_points grows by one row per monitor poll (response-time metrics), like
-- monitor_checks. Partition by month on "timestamp" so range aggregates for the
-- public charts prune to a few partitions and retention drops whole months.

ALTER TABLE metric_points RENAME TO metric_points_legacy;
ALTER INDEX metric_points_pkey RENAME TO metric_points_legacy_pkey;
ALTER INDEX metric_points_metric_timestamp_idx RENAME TO metric_points_legacy_metric_timestamp_idx;

CREATE TABLE metric_points (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  "timestamp" timestamptz NOT NULL,
  value double precision NOT NULL,
  -- A partitioned table's primary key must include the partition key.
  PRIMARY KEY (id, "timestamp")
) PARTITION BY RANGE ("timestamp");

-- Serves per-metric time-range scans: latest value, date_bin aggregates and retention.
CREATE INDEX metric_points_metric_timestamp_idx ON metric_points (metric_id, "timestamp" DESC);

-- Safety net for rows whose month has no partition yet; ensure_metric_point_partition moves them out.
CREATE TABLE metric_points_default PARTITION OF metric_points DEFAULT;

CREATE FUNCTION ensure_metric_point_partition(month_start date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  first_day date := date_trunc('month', month_start)::date;
  partition_name text := format('metric_points_%s', to_char(first_day, 'YYYY_MM'));
BEGIN
  IF to_regclass(partition_name) IS NOT NULL THEN
    RETURN;
  END IF;
  -- Creating a range partition fails while the default partition holds rows in
  -- that range, so move them aside and back within this transaction.
  CREATE TEMP TABLE metric_points_moving ON COMMIT DROP AS
    WITH moved AS (
      DELETE FROM metric_points_default
      WHERE "timestamp" >= first_day AND "timestamp" < (first_day + interval '1 month')
      RETURNING *
    )
    SELECT * FROM moved;
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF metric_points FOR VALUES FROM (%L) TO (%L)',
    partition_name, first_day, (first_day + interval '1 month')::date
  );
  INSERT INTO metric_points SELECT * FROM metric_points_moving;
  DROP TABLE metric_points_moving;
END;
$$;

-- Drops monthly partitions whose whole range is older than the cutoff; returns how many.
CREATE FUNCTION drop_metric_point_partitions_before(cutoff timestamptz) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  child record;
  dropped integer := 0;
BEGIN
  FOR child IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'metric_points'::regclass
      AND c.relname ~ '^metric_points_\d{4}_\d{2}$'
  LOOP
    IF (to_date(substring(child.relname from '\d{4}_\d{2}$'), 'YYYY_MM') + interval '1 month') <= cutoff THEN
      EXECUTE format('DROP TABLE %I', child.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END;
$$;

-- Months that hold existing data, through two months ahead.
DO $$
DECLARE
  month_cursor date := date_trunc('month', coalesce((SELECT min("timestamp") FROM metric_points_legacy), now()))::date;
BEGIN
  WHILE month_cursor <= (date_trunc('month', now()) + interval '2 months')::date LOOP
    PERFORM ensure_metric_point_partition(month_cursor);
    month_cursor := (month_cursor + interval '1 month')::date;
  END LOOP;
END;
$$;

INSERT INTO metric_points (id, metric_id, "timestamp", value)
SELECT id, metric_id, "timestamp", value FROM metric_points_legacy;

DROP TABLE metric_points_legacy;
