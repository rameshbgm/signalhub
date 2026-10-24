-- Sealed audit entries must never change. Their actor_id and organization_id
-- are part of the hashed content, but both columns referenced a parent row with
-- ON DELETE SET NULL, so deleting a user or an organization silently rewrote
-- sealed entries and broke `signalhubctl audit` verification. Keep the ids as
-- plain values: an entry about a deleted account still names it.
ALTER TABLE platform_audit_logs DROP CONSTRAINT IF EXISTS platform_audit_logs_actor_id_fkey;
ALTER TABLE platform_audit_logs DROP CONSTRAINT IF EXISTS platform_audit_logs_organization_id_fkey;
