CREATE TABLE maintenance_leases (
  id text PRIMARY KEY,
  owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_completed_at timestamptz
);

CREATE INDEX maintenance_leases_expiry_idx ON maintenance_leases (lease_expires_at);

-- Public page reads and scoped incident rendering.
CREATE INDEX page_announcements_surfaces_idx
  ON page_announcements USING gin (surfaces);
CREATE INDEX incidents_page_active_idx
  ON incidents (page_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- Session and background queue hot paths avoid scanning completed history.
CREATE INDEX auth_sessions_user_live_idx
  ON auth_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX notification_jobs_ready_idx
  ON notification_jobs (next_attempt_at, lease_expires_at)
  WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX audit_delivery_jobs_ready_idx
  ON audit_delivery_jobs (next_attempt_at, lease_expires_at)
  WHERE status = 'PENDING';
CREATE INDEX monitors_enabled_due_idx
  ON monitors (last_checked_at, lease_expires_at)
  WHERE enabled = true;

-- Subscriber delivery frequently filters a page by channel and verification.
CREATE INDEX subscribers_page_delivery_idx
  ON subscribers (page_id, channel, verified, quarantined);
