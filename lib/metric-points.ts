import { sql } from "kysely";
import { database } from "@/lib/postgres/client";

/** Monthly partitions kept ready ahead of now, so inserts never fall into the default partition. */
const PARTITION_MONTHS_AHEAD = 2;

/** Creates this month's metric_points partition and the next few. Idempotent. */
export async function ensureMetricPointPartitions(now = new Date()) {
  for (let offset = 0; offset <= PARTITION_MONTHS_AHEAD; offset += 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    await sql`select ensure_metric_point_partition(${month.toISOString().slice(0, 10)}::date)`.execute(database);
  }
}

/** Drops whole monthly partitions older than the cutoff; returns how many. */
export async function dropMetricPointPartitionsBefore(cutoff: Date) {
  const result = await sql<{ dropped: number }>`select drop_metric_point_partitions_before(${cutoff}) as dropped`.execute(database);
  return result.rows[0]?.dropped ?? 0;
}
