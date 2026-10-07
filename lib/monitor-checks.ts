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

export type MonitorCheckSort = "newest" | "oldest" | "slowest" | "fastest";
export type MonitorCheckFilter = { result?: "up" | "down"; sort?: MonitorCheckSort };

/**
 * One numbered page of a monitor's check history, optionally only up or down
 * checks, sorted by time or latency (checks without a latency sort last).
 * Offset paging, because latency order has no stable keyset cursor; history is
 * bounded by retention, and the total drives "page N of M".
 */
export async function listMonitorChecks(monitorId: string, page = 1, limit = MONITOR_CHECK_PAGE_SIZE, { result, sort = "newest" }: MonitorCheckFilter = {}) {
  let base = database.selectFrom("monitorChecks").where("monitorId", "=", monitorId);
  if (result) base = base.where("ok", "=", result === "up");
  const { total } = await base.select((eb) => eb.fn.countAll<string>().as("total")).executeTakeFirstOrThrow();
  const pageCount = Math.max(1, Math.ceil(Number(total) / limit));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);

  let query = base.select(["id", "checkedAt", "ok", "statusCode", "latencyMs", "error"]);
  if (sort === "slowest" || sort === "fastest") {
    query = query.orderBy(sql`latency_ms ${sql.raw(sort === "slowest" ? "desc" : "asc")} nulls last`);
  }
  const order = sort === "oldest" ? "asc" : "desc";
  const rows = await query.orderBy("checkedAt", order).orderBy("id", order).limit(limit).offset((current - 1) * limit).execute();
  return { checks: rows.map(view), page: current, pageCount, total: Number(total) };
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
