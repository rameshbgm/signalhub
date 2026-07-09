"""
Applies a check result to a monitor: writes history, updates run-state, and
on a fail/recover threshold crossing drives the configured actions (status
flip, response-time metric, auto-incident). Mirrors applyResult() from the
old lib/monitor-runner.ts — same collections, same field names, same
threshold-crossing semantics, so history recorded by the old Node runner
and this service stay consistent.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from pymongo.database import Database

from checks import CheckResult

COMPONENT_STATUSES = {
    "OPERATIONAL",
    "DEGRADED_PERFORMANCE",
    "PARTIAL_OUTAGE",
    "MAJOR_OUTAGE",
    "UNDER_MAINTENANCE",
}


def set_component_status(db: Database, component_id: ObjectId, status: str) -> bool:
    """Closes the open componentStatusEvents interval and opens a new one,
    then updates the denormalized status field. Returns True if changed."""
    component = db.components.find_one({"_id": component_id})
    if not component or component.get("status") == status:
        return False

    now = datetime.now(timezone.utc)
    db.componentStatusEvents.update_many(
        {"componentId": component_id, "endedAt": None}, {"$set": {"endedAt": now}}
    )
    db.componentStatusEvents.insert_one(
        {
            "_id": ObjectId(),
            "componentId": component_id,
            "status": status,
            "startedAt": now,
            "endedAt": None,
            "isMaintenance": status == "UNDER_MAINTENANCE",
        }
    )
    db.components.update_one({"_id": component_id}, {"$set": {"status": status}})
    return True


def _open_auto_incident(db: Database, monitor: dict, error: str | None) -> ObjectId | None:
    component_id = monitor.get("componentId")
    if not component_id:
        return None

    now = datetime.now(timezone.utc)
    incident_id = ObjectId()
    db.incidents.insert_one(
        {
            "_id": incident_id,
            "pageId": monitor["pageId"],
            "name": f"{monitor['name']} is down",
            "status": "INVESTIGATING",
            "impact": "MAJOR",
            "isMaintenance": False,
            "maintenanceStatus": None,
            "scheduledStart": None,
            "scheduledEnd": None,
            "autoTransition": False,
            "notifySubscribers": bool(monitor.get("actionNotify")),
            "postmortemBody": None,
            "postmortemPublishedAt": None,
            "createdAt": now,
            "resolvedAt": None,
            "backfilled": False,
        }
    )
    db.incidentComponents.insert_one(
        {
            "_id": ObjectId(),
            "incidentId": incident_id,
            "componentId": component_id,
            "newStatus": monitor.get("downStatus", "MAJOR_OUTAGE"),
        }
    )
    error_suffix = f" Error: {error}" if error else ""
    db.incidentUpdates.insert_one(
        {
            "_id": ObjectId(),
            "incidentId": incident_id,
            "status": "INVESTIGATING",
            "body": f'Automated monitor "{monitor["name"]}" detected this component is down.{error_suffix}',
            "createdAt": now,
            "notified": bool(monitor.get("actionNotify")),
        }
    )
    return incident_id


def _resolve_auto_incident(db: Database, incident_id: ObjectId, monitor: dict) -> None:
    now = datetime.now(timezone.utc)
    db.incidents.update_one({"_id": incident_id}, {"$set": {"status": "RESOLVED", "resolvedAt": now}})
    db.incidentUpdates.insert_one(
        {
            "_id": ObjectId(),
            "incidentId": incident_id,
            "status": "RESOLVED",
            "body": f'Automated monitor "{monitor["name"]}" confirmed recovery. This incident has been resolved.',
            "createdAt": now,
            "notified": bool(monitor.get("actionNotify")),
        }
    )


def apply_result(db: Database, monitor: dict, result: CheckResult) -> None:
    now = datetime.now(timezone.utc)
    db.monitorChecks.insert_one(
        {
            "_id": ObjectId(),
            "monitorId": monitor["_id"],
            "checkedAt": now,
            "ok": result.ok,
            "latencyMs": result.latency_ms,
            "statusCode": result.status_code,
            "error": result.error,
        }
    )

    prev_fails = monitor.get("consecutiveFails", 0)
    prev_oks = monitor.get("consecutiveOks", 0)
    consecutive_fails = 0 if result.ok else prev_fails + 1
    consecutive_oks = prev_oks + 1 if result.ok else 0

    if monitor.get("actionRecordMetric") and monitor.get("metricId") and result.latency_ms is not None:
        db.metricPoints.insert_one(
            {"_id": ObjectId(), "metricId": monitor["metricId"], "timestamp": now, "value": result.latency_ms}
        )

    current_incident_id = monitor.get("currentIncidentId")
    fail_threshold = monitor.get("failThreshold", 1)
    recover_threshold = monitor.get("recoverThreshold", 1)

    was_down = prev_fails >= fail_threshold
    is_down = consecutive_fails >= fail_threshold
    was_up = prev_oks >= recover_threshold or (monitor.get("lastCheckedAt") is None and prev_fails == 0)
    is_up = consecutive_oks >= recover_threshold

    component_id = monitor.get("componentId")

    if not was_down and is_down and component_id:
        if monitor.get("actionFlipStatus"):
            set_component_status(db, component_id, monitor.get("downStatus", "MAJOR_OUTAGE"))
        if monitor.get("actionAutoIncident"):
            current_incident_id = _open_auto_incident(db, monitor, result.error)

    if was_down and is_up and not was_up:
        if monitor.get("actionFlipStatus") and component_id:
            set_component_status(db, component_id, "OPERATIONAL")
        if monitor.get("actionAutoIncident") and current_incident_id:
            _resolve_auto_incident(db, current_incident_id, monitor)
            current_incident_id = None

    db.monitors.update_one(
        {"_id": monitor["_id"]},
        {
            "$set": {
                "lastCheckedAt": now,
                "lastLatencyMs": result.latency_ms,
                "lastOk": result.ok,
                "lastError": result.error,
                "consecutiveFails": consecutive_fails,
                "consecutiveOks": consecutive_oks,
                "currentIncidentId": current_incident_id,
            }
        },
    )
