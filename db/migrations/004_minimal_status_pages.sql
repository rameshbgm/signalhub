-- SignalHub page-management enhancements.
--
-- This migration is intentionally additive. Existing status pages, access
-- models, design history, feeds, monitoring, and retention settings remain
-- available throughout the rollout.

CREATE TABLE IF NOT EXISTS asset_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  storage_driver text NOT NULL CHECK (storage_driver IN ('LOCAL', 'S3')),
  storage_key text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('PAGE_ASSET', 'DATA_EXPORT')),
  source_id uuid,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (storage_driver, storage_key)
);

CREATE INDEX IF NOT EXISTS asset_deletion_jobs_queue_idx
  ON asset_deletion_jobs (status, next_attempt_at, lease_expires_at);

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'WELCOME'
    CHECK (onboarding_step IN ('WELCOME', 'COMPONENTS', 'LOGO', 'NOTIFICATIONS', 'INVITE_TEAM', 'INCIDENTS', 'COMPLETE')),
  ADD COLUMN IF NOT EXISTS organization_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_url text,
  ADD COLUMN IF NOT EXISTS default_sms_country_code text NOT NULL DEFAULT '+1',
  ADD COLUMN IF NOT EXISTS google_analytics_id text,
  ADD COLUMN IF NOT EXISTS noindex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS header_html text,
  ADD COLUMN IF NOT EXISTS footer_html text,
  ADD COLUMN IF NOT EXISTS email_logo_url text,
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to text,
  ADD COLUMN IF NOT EXISTS email_footer text;

UPDATE pages
SET organization_name = organizations.name
FROM organizations
WHERE pages.org_id = organizations.id
  AND pages.organization_name = '';

CREATE INDEX IF NOT EXISTS pages_org_name_idx ON pages (org_id, name, id);
CREATE INDEX IF NOT EXISTS pages_public_slug_idx ON pages (slug) WHERE public_visible = true AND deleted_at IS NULL;

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'MANUAL'
    CHECK (source_type IN ('MANUAL', 'STATUSPAGE')),
  ADD COLUMN IF NOT EXISTS external_status_url text,
  ADD COLUMN IF NOT EXISTS external_component_id text,
  ADD COLUMN IF NOT EXISTS external_link_url text,
  ADD COLUMN IF NOT EXISTS external_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_last_error text;

CREATE INDEX IF NOT EXISTS components_external_sync_idx
  ON components (source_type, external_last_synced_at)
  WHERE source_type = 'STATUSPAGE';

ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS incident_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_ciphertext text,
  ADD COLUMN IF NOT EXISTS contact_hash text,
  ADD COLUMN IF NOT EXISTS display_contact text;

UPDATE subscribers
SET display_contact = contact
WHERE display_contact IS NULL;

CREATE INDEX IF NOT EXISTS subscribers_page_channel_idx ON subscribers (page_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS subscribers_contact_hash_idx ON subscribers (page_id, channel, contact_hash)
  WHERE contact_hash IS NOT NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS next_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_interval_minutes integer;

-- Tenant audit logging has been retired. Platform audit records remain a
-- separate platform-administration concern.
DROP TABLE IF EXISTS audit_logs;
ALTER TABLE retention_policies DROP COLUMN IF EXISTS audit_logs_days;
