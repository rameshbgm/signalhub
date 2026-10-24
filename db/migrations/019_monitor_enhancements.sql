-- HTTP monitor options (cache buster, IP family, upside-down, saved error response),
-- OAuth2/mTLS auth config, outbound proxies, and certificate/domain expiry tracking.

CREATE TABLE proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL CHECK (protocol IN ('HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5')),
  host text NOT NULL,
  port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  auth_username text,
  -- Encrypted with lib/encryption.ts; listed in scripts/statusctl.ts for key rotation.
  auth_secret text,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX proxies_org_idx ON proxies (org_id);
CREATE UNIQUE INDEX proxies_one_default_idx ON proxies (org_id) WHERE is_default;

ALTER TABLE monitors
  ADD COLUMN cache_buster boolean NOT NULL DEFAULT false,
  ADD COLUMN ip_family text NOT NULL DEFAULT 'AUTO' CHECK (ip_family IN ('AUTO', 'IPV4', 'IPV6')),
  ADD COLUMN upside_down boolean NOT NULL DEFAULT false,
  ADD COLUMN save_error_response boolean NOT NULL DEFAULT false,
  ADD COLUMN proxy_id uuid REFERENCES proxies(id) ON DELETE SET NULL,
  -- Encrypted JSON for OAuth2 client credentials and mTLS; listed in scripts/statusctl.ts.
  ADD COLUMN auth_config_ciphertext text,
  ADD COLUMN cert_expiry_notify boolean NOT NULL DEFAULT false,
  ADD COLUMN domain_expiry_notify boolean NOT NULL DEFAULT false,
  ADD COLUMN cert_expires_at timestamptz,
  -- The expiry date a warning was already sent for, so each certificate/domain period warns once.
  ADD COLUMN cert_notified_for timestamptz,
  ADD COLUMN domain_expires_at timestamptz,
  ADD COLUMN domain_notified_for timestamptz,
  ADD COLUMN domain_checked_at timestamptz;

CREATE INDEX monitors_proxy_idx ON monitors (proxy_id) WHERE proxy_id IS NOT NULL;

-- Truncated response body, kept only when the monitor opted in to saving error responses.
ALTER TABLE monitor_checks ADD COLUMN response text;

-- Same shape as retention_policies: a NULL org_id row is the platform default.
CREATE TABLE monitoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  cert_expiry_warn_days integer NOT NULL,
  domain_expiry_warn_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX monitoring_settings_platform_default_idx ON monitoring_settings ((org_id IS NULL)) WHERE org_id IS NULL;
CREATE INDEX monitoring_settings_updated_by_idx ON monitoring_settings (updated_by);
