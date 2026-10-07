-- Monitor checks are the highest-volume table: one row per monitor per poll.
-- Partition it by month on checked_at so time-bounded reads and retention
-- prune to a few partitions, and whole expired months can be dropped instead
-- of deleted row by row.

ALTER TABLE monitor_checks RENAME TO monitor_checks_legacy;
ALTER INDEX monitor_checks_pkey RENAME TO monitor_checks_legacy_pkey;
ALTER INDEX monitor_checks_monitor_checked_idx RENAME TO monitor_checks_legacy_monitor_checked_idx;
ALTER INDEX monitor_checks_checked_idx RENAME TO monitor_checks_legacy_checked_idx;

CREATE TABLE monitor_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL,
  ok boolean NOT NULL,
  latency_ms integer,
  status_code integer,
  error text,
  -- A partitioned table's primary key must include the partition key.
  PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);

-- Serves "latest N checks for a monitor" and the keyset history pagination
-- (monitor_id = ? and (checked_at, id) < cursor order by checked_at desc, id desc),
-- plus per-tenant retention (monitor_id in (...) and checked_at < cutoff).
CREATE INDEX monitor_checks_monitor_checked_idx ON monitor_checks (monitor_id, checked_at DESC, id DESC);

-- Safety net: rows land here only if the worker has not created their month
-- yet. ensure_monitor_check_partition moves them out when it does.
CREATE TABLE monitor_checks_default PARTITION OF monitor_checks DEFAULT;

CREATE FUNCTION ensure_monitor_check_partition(month_start date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  first_day date := date_trunc('month', month_start)::date;
  partition_name text := format('monitor_checks_%s', to_char(first_day, 'YYYY_MM'));
BEGIN
  IF to_regclass(partition_name) IS NOT NULL THEN
    RETURN;
  END IF;
  -- Creating a range partition fails while the default partition holds rows
  -- in that range, so move them aside and back within this transaction.
  CREATE TEMP TABLE monitor_checks_moving ON COMMIT DROP AS
    WITH moved AS (
      DELETE FROM monitor_checks_default
      WHERE checked_at >= first_day AND checked_at < (first_day + interval '1 month')
      RETURNING *
    )
    SELECT * FROM moved;
  EXECUTE format(
    'CREATE TABLE %I PARTITION OF monitor_checks FOR VALUES FROM (%L) TO (%L)',
    partition_name, first_day, (first_day + interval '1 month')::date
  );
  INSERT INTO monitor_checks SELECT * FROM monitor_checks_moving;
  DROP TABLE monitor_checks_moving;
END;
$$;

-- Drops monthly partitions whose whole range is older than the cutoff.
-- Returns how many partitions were dropped.
CREATE FUNCTION drop_monitor_check_partitions_before(cutoff timestamptz) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  child record;
  dropped integer := 0;
BEGIN
  FOR child IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'monitor_checks'::regclass
      AND c.relname ~ '^monitor_checks_\d{4}_\d{2}$'
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
  month_cursor date := date_trunc('month', coalesce((SELECT min(checked_at) FROM monitor_checks_legacy), now()))::date;
BEGIN
  WHILE month_cursor <= (date_trunc('month', now()) + interval '2 months')::date LOOP
    PERFORM ensure_monitor_check_partition(month_cursor);
    month_cursor := (month_cursor + interval '1 month')::date;
  END LOOP;
END;
$$;

INSERT INTO monitor_checks (id, monitor_id, checked_at, ok, latency_ms, status_code, error)
SELECT id, monitor_id, checked_at, ok, latency_ms, status_code, error FROM monitor_checks_legacy;

DROP TABLE monitor_checks_legacy;
