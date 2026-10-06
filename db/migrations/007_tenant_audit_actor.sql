-- Restore tenant audit on the sealed installation audit log. Organization
-- members are recorded with actor_role 'TENANT' (their membership role is kept
-- in metadata), so they are never mistaken for installation administrators.
-- Additive: existing ADMIN and SYSTEM entries remain valid.
ALTER TABLE platform_audit_logs DROP CONSTRAINT IF EXISTS platform_audit_logs_actor_role_check;
ALTER TABLE platform_audit_logs
  ADD CONSTRAINT platform_audit_logs_actor_role_check
  CHECK (actor_role IN ('ADMIN', 'SYSTEM', 'TENANT'));

CREATE INDEX IF NOT EXISTS platform_audit_logs_org_created_idx
  ON platform_audit_logs (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
