import { sql } from "kysely";
import { database } from "@/lib/postgres/client";

/** Rows per page in the check history drawer. */
export const MONITOR_CHECK_PAGE_SIZE = 25;
/** Monthly partitions kept ready ahead of now, so inserts never fall into the default partition. */
const PARTITION_MONTHS_AHEAD = 2;

export type MonitorCheckView = {
  id: string;
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
};

/** Opaque keyset cursor: the (checkedAt, id) of the last row on the previous page. */
export type MonitorCheckCursor = { checkedAt: string; id: string };

function view(row: { id: string; checkedAt: Date | string; ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null }): MonitorCheckView {
  return {
    id: row.id,
    checkedAt: new Date(row.checkedAt).toISOString(),
    ok: row.ok,
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    error: row.error,
  };
}

/**
 * The newest `limit` checks for each monitor. A lateral join reads at most
 * `limit` rows per monitor from monitor_checks_monitor_checked_idx instead of
 * ranking a monitor's whole history.
 */
export async function latestChecksByMonitor(monitorIds: string[], limit: number) {
  const byMonitor = new Map<string, MonitorCheckView[]>(monitorIds.map((id) => [id, []]));
  if (!monitorIds.length) return byMonitor;
  const rows = await database
    // A scalar function aliased "monitor" exposes its value as column monitor.monitor.
    .selectFrom(sql<{ monitor: string }>`unnest(${sql.val(monitorIds)}::uuid[])`.as("monitor"))
    .innerJoinLateral(
      (eb) => eb.selectFrom("monitorChecks")
        .select(["id", "monitorId", "checkedAt", "ok", "statusCode", "latencyMs", "error"])
        .whereRef("monitorChecks.monitorId", "=", sql.ref("monitor.monitor"))
        .orderBy("checkedAt", "desc").orderBy("id", "desc")
        .limit(limit)
        .as("check"),
      (join) => join.onTrue()
    )
    .selectAll("check")
    .execute();
  for (const row of rows) byMonitor.get(row.monitorId)?.push(view(row));
  return byMonitor;
}

/**
 * One page of a monitor's check history, newest first, using keyset
 * pagination so deep pages cost the same as the first one.
 */
export async function listMonitorChecks(monitorId: string, before: MonitorCheckCursor | null, limit = MONITOR_CHECK_PAGE_SIZE) {
  let query = database.selectFrom("monitorChecks")
    .select(["id", "checkedAt", "ok", "statusCode", "latencyMs", "error"])
    .where("monitorId", "=", monitorId);
  if (before) {
    const checkedAt = new Date(before.checkedAt);
    query = query
      // The plain bound lets the planner prune newer partitions; the row
      // comparison breaks ties between checks in the same instant.
      .where("checkedAt", "<=", checkedAt)
      .where(sql<boolean>`(checked_at, id) < (${checkedAt}, ${before.id}::uuid)`);
  }
  // One extra row tells whether an older page exists without a count(*).
  const rows = await query.orderBy("checkedAt", "desc").orderBy("id", "desc").limit(limit + 1).execute();
  const checks = rows.slice(0, limit).map(view);
  const last = checks.at(-1);
  return {
    checks,
    nextCursor: rows.length > limit && last ? { checkedAt: last.checkedAt, id: last.id } : null,
  };
}

/** Creates this month's partition and the next few. Idempotent. */
export async function ensureMonitorCheckPartitions(now = new Date()) {
  for (let offset = 0; offset <= PARTITION_MONTHS_AHEAD; offset += 1) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    await sql`select ensure_monitor_check_partition(${month.toISOString().slice(0, 10)}::date)`.execute(database);
  }
}

/** Drops whole monthly partitions older than the cutoff; returns how many. */
export async function dropMonitorCheckPartitionsBefore(cutoff: Date) {
  const result = await sql<{ dropped: number }>`select drop_monitor_check_partitions_before(${cutoff}) as dropped`.execute(database);
  return result.rows[0]?.dropped ?? 0;
}
