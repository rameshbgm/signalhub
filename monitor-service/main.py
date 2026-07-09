"""
Standalone monitor scheduler. Replaces the Next.js /api/cron/run-checks
route: runs in-process on a fixed interval (APScheduler), pulls due
monitors from the same MongoDB the status page app uses, and applies
results via the same state-machine semantics (status flip, metric point,
auto-incident) as the app's own component-status writers.

Run:
    pip install -r requirements.txt
    python main.py

Config (env vars, see .env.example):
    DATABASE_URL      Mongo connection string (same one the Next.js app uses)
    POLL_INTERVAL_SEC How often to scan for due monitors (default 30)
    CHECK_CONCURRENCY Max checks run in parallel per scan (default 5)
"""

from __future__ import annotations

import logging
import os
import signal
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from pymongo import MongoClient

from checks import run_check
from state import apply_result

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("monitor-service")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    log.error("DATABASE_URL is not set (check .env)")
    sys.exit(1)

POLL_INTERVAL_SEC = int(os.environ.get("POLL_INTERVAL_SEC", "30"))
CHECK_CONCURRENCY = int(os.environ.get("CHECK_CONCURRENCY", "5"))

client = MongoClient(DATABASE_URL)
db = client.get_default_database()


def due_monitors() -> list[dict]:
    now = datetime.now(timezone.utc)
    candidates = list(db.monitors.find({"enabled": True}))
    due = []
    for m in candidates:
        last_checked = m.get("lastCheckedAt")
        if last_checked is None:
            due.append(m)
            continue
        if last_checked.tzinfo is None:
            last_checked = last_checked.replace(tzinfo=timezone.utc)
        interval = timedelta(seconds=m.get("intervalSec", 300))
        if last_checked + interval <= now:
            due.append(m)
    return due


def run_one(monitor: dict) -> tuple[str, bool, str | None]:
    result = run_check(monitor)
    apply_result(db, monitor, result)
    return str(monitor["_id"]), result.ok, result.error


def run_due_checks() -> None:
    monitors = due_monitors()
    if not monitors:
        return
    log.info("running %d due monitor(s)", len(monitors))
    with ThreadPoolExecutor(max_workers=CHECK_CONCURRENCY) as pool:
        futures = [pool.submit(run_one, m) for m in monitors]
        for future in as_completed(futures):
            try:
                monitor_id, ok, error = future.result()
                log.info("monitor %s -> ok=%s error=%s", monitor_id, ok, error)
            except Exception:
                log.exception("check raised an unhandled exception")


def main() -> None:
    scheduler = BackgroundScheduler(timezone=timezone.utc)
    scheduler.add_job(run_due_checks, "interval", seconds=POLL_INTERVAL_SEC, next_run_time=datetime.now(timezone.utc))
    scheduler.start()
    log.info("monitor-service started, polling every %ds (concurrency=%d)", POLL_INTERVAL_SEC, CHECK_CONCURRENCY)

    def shutdown(*_args):
        log.info("shutting down")
        scheduler.shutdown(wait=False)
        client.close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    signal.pause()


if __name__ == "__main__":
    main()
