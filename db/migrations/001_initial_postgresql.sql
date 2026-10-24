CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  contact_email text,
  suspended boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETING')),
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  mutation_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizations_status_created_idx ON organizations (status, created_at DESC);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  canonical_username text NOT NULL UNIQUE,
  email text NOT NULL,
  canonical_email text NOT NULL,
  password_hash text,
  name text NOT NULL,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  oidc_issuer text,
  oidc_subject text,
  disabled boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  must_complete_profile boolean NOT NULL DEFAULT false,
  session_version integer NOT NULL DEFAULT 1,
  mfa_required boolean NOT NULL DEFAULT false,
  totp_secret_ciphertext text,
  pending_totp_secret_ciphertext text,
  recovery_code_hashes text[] NOT NULL DEFAULT '{}',
  mfa_enrolled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_canonical_email_idx ON users (canonical_email);

ALTER TABLE organizations
  ADD CONSTRAINT organizations_status_changed_by_fk
  FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN', 'INCIDENT_MANAGER', 'RESPONDER', 'VIEWER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED')),
  page_ids uuid[],
  invitation_expires_at timestamptz,
  invitation_token_hash text,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX memberships_user_created_idx ON memberships (user_id, created_at);
CREATE INDEX memberships_org_status_idx ON memberships (org_id, status);
CREATE INDEX memberships_page_ids_idx ON memberships USING gin (page_ids);
CREATE UNIQUE INDEX memberships_invitation_token_idx ON memberships (invitation_token_hash) WHERE invitation_token_hash IS NOT NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'TENANT' CHECK (kind IN ('TENANT', 'PLATFORM')),
  token_hash text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES memberships(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  session_version integer NOT NULL DEFAULT 1,
  auth_method text NOT NULL CHECK (auth_method IN ('PASSWORD', 'OIDC', 'SAML', 'SUPPORT')),
  mfa_verified boolean NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, revoked_at, last_seen_at DESC);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (absolute_expires_at);

CREATE TABLE support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  mode text NOT NULL DEFAULT 'VIEW' CHECK (mode IN ('VIEW', 'OPERATE')),
  scopes text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason text,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('ADMIN', 'SYSTEM')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb,
  previous_hash text,
  entry_hash text,
  chain_sequence bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_audit_logs_created_idx ON platform_audit_logs (created_at DESC);
CREATE INDEX platform_audit_logs_org_created_idx ON platform_audit_logs (organization_id, created_at DESC);
CREATE INDEX platform_audit_logs_actor_created_idx ON platform_audit_logs (actor_id, created_at DESC);

CREATE TABLE platform_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type = 'PURGE_ORGANIZATION'),
  status text NOT NULL CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  organization_id uuid NOT NULL,
  organization_slug text NOT NULL,
  organization_name text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  purge_scope jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX platform_jobs_queue_idx ON platform_jobs (status, next_attempt_at, lease_expires_at);
CREATE INDEX platform_jobs_org_created_idx ON platform_jobs (organization_id, created_at DESC);

CREATE TABLE organization_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  slug text NOT NULL,
  name text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  purged_at timestamptz NOT NULL,
  purge_scope jsonb
);

CREATE INDEX organization_tombstones_slug_purged_idx ON organization_tombstones (slug, purged_at DESC);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  last_four text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  page_ids uuid[],
  expires_at timestamptz,
  allowed_cidrs text[],
  legacy_full_access boolean NOT NULL DEFAULT false
);

CREATE INDEX api_keys_org_active_idx ON api_keys (org_id, revoked_at, expires_at);

CREATE TABLE identity_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('OIDC', 'SAML')),
  audience text NOT NULL CHECK (audience IN ('ORGANIZATION', 'PLATFORM')),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  config_ciphertext text NOT NULL,
  role_mappings jsonb NOT NULL DEFAULT '[]',
  default_role text,
  accepted_acr_values text[] NOT NULL DEFAULT '{}',
  accepted_amr_values text[] NOT NULL DEFAULT '{}',
  allow_jit_provisioning boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_connections_audience_org_idx ON identity_connections (audience, org_id, enabled);

CREATE TABLE external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES identity_connections(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  canonical_email text NOT NULL,
  groups text[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, subject)
);

CREATE INDEX external_identities_connection_user_idx ON external_identities (connection_id, user_id);

CREATE TABLE scim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES identity_connections(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  last_four text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX scim_tokens_connection_active_idx ON scim_tokens (connection_id, revoked_at);

CREATE TABLE scim_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES identity_connections(id) ON DELETE CASCADE,
  external_id text,
  display_name text NOT NULL,
  member_external_ids text[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, display_name)
);

CREATE TABLE saml_requests (
  id text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX saml_requests_expiry_idx ON saml_requests (expires_at);

CREATE TABLE retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  monitor_checks_days integer NOT NULL,
  analytics_days integer NOT NULL,
  notification_logs_days integer NOT NULL,
  resolved_incidents_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX retention_policies_platform_default_idx ON retention_policies ((org_id IS NULL)) WHERE org_id IS NULL;

CREATE TABLE data_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key text,
  storage_driver text CHECK (storage_driver IN ('LOCAL', 'S3')),
  checksum text,
  attempts integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX data_export_jobs_queue_idx ON data_export_jobs (status, lease_expires_at, created_at);
CREATE INDEX data_export_jobs_org_created_idx ON data_export_jobs (org_id, created_at DESC);

CREATE TABLE audit_chain_states (
  id text PRIMARY KEY,
  latest_hash text,
  sequence bigint NOT NULL DEFAULT 0,
  retained_sequence bigint,
  retained_previous_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_sinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_sinks_org_enabled_idx ON audit_sinks (org_id, enabled);

CREATE TABLE audit_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sink_id uuid NOT NULL REFERENCES audit_sinks(id) ON DELETE CASCADE,
  deduplication_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'DEAD_LETTER')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  response_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX audit_delivery_jobs_queue_idx ON audit_delivery_jobs (status, next_attempt_at, lease_expires_at);

CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('PUBLIC', 'PRIVATE', 'AUDIENCE')),
  is_hub boolean NOT NULL DEFAULT false,
  hub_parent_id uuid REFERENCES pages(id) ON DELETE SET NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  language text NOT NULL DEFAULT 'en',
  headline text NOT NULL DEFAULT '',
  about_text text NOT NULL DEFAULT '',
  logo_url text,
  favicon_url text,
  cover_image_url text,
  cover_image_fit text CHECK (cover_image_fit IN ('COVER', 'CONTAIN')),
  cover_image_position_x double precision,
  cover_image_position_y double precision,
  cover_image_crop_x double precision,
  cover_image_crop_y double precision,
  cover_image_crop_width double precision,
  cover_image_crop_height double precision,
  brand_color text NOT NULL DEFAULT '#0f9fab',
  layout text NOT NULL DEFAULT 'STANDARD',
  support_url text,
  terms_url text,
  privacy_url text,
  password_hash text,
  remove_branding boolean NOT NULL DEFAULT false,
  custom_css text,
  theme_preset text,
  theme_mode text DEFAULT 'SYSTEM' CHECK (theme_mode IN ('SYSTEM', 'LIGHT', 'DARK')),
  allow_theme_override boolean NOT NULL DEFAULT true,
  analytics_enabled boolean NOT NULL DEFAULT true,
  published_design jsonb,
  published_design_version integer NOT NULL DEFAULT 1,
  design_published_at timestamptz,
  public_visible boolean NOT NULL DEFAULT true,
  setup_completed_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pages_org_created_idx ON pages (org_id, created_at);
CREATE INDEX pages_org_active_idx ON pages (org_id, deleted_at, public_visible);
CREATE INDEX pages_hub_parent_idx ON pages (hub_parent_id);

CREATE TABLE page_design_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL UNIQUE REFERENCES pages(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  base_published_version integer NOT NULL,
  design jsonb NOT NULL,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE page_design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version integer NOT NULL,
  design jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);

CREATE INDEX page_design_versions_page_published_idx ON page_design_versions (page_id, published_at DESC);

CREATE TABLE page_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL')),
  cta_label text,
  cta_url text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  dismissible boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  surfaces text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX page_announcements_page_window_idx ON page_announcements (page_id, starts_at, ends_at);

CREATE TABLE component_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  "order" integer NOT NULL DEFAULT 0,
  collapsed boolean NOT NULL DEFAULT false
);

CREATE INDEX component_groups_page_order_idx ON component_groups (page_id, "order");

CREATE TABLE components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  group_id uuid REFERENCES component_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OPERATIONAL',
  "order" integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  show_uptime boolean NOT NULL DEFAULT true,
  manual_status text NOT NULL DEFAULT 'OPERATIONAL',
  is_third_party boolean NOT NULL DEFAULT false,
  third_party_provider text,
  automation_token_hash text NOT NULL,
  automation_token_prefix text NOT NULL,
  automation_token_last_four text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX components_page_order_idx ON components (page_id, "order");
CREATE INDEX components_group_idx ON components (group_id);
CREATE UNIQUE INDEX components_automation_token_idx ON components (automation_token_hash);

CREATE TABLE page_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE TABLE page_access_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  group_id uuid REFERENCES page_access_groups(id) ON DELETE SET NULL,
  component_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, email)
);

CREATE TABLE component_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  is_maintenance boolean NOT NULL DEFAULT false,
  note text
);

CREATE INDEX component_status_events_component_started_idx ON component_status_events (component_id, started_at);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL,
  impact text NOT NULL,
  page_wide boolean NOT NULL DEFAULT false,
  is_maintenance boolean NOT NULL DEFAULT false,
  maintenance_status text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  auto_transition boolean NOT NULL DEFAULT false,
  reminder_minutes_before integer,
  reminder_sent_at timestamptz,
  notify_subscribers boolean NOT NULL DEFAULT true,
  postmortem_body text,
  postmortem_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  backfilled boolean NOT NULL DEFAULT false
);

CREATE INDEX incidents_page_created_idx ON incidents (page_id, created_at DESC);
CREATE INDEX incidents_maintenance_schedule_idx ON incidents (is_maintenance, maintenance_status, scheduled_start);
CREATE INDEX incidents_resolved_idx ON incidents (resolved_at) WHERE resolved_at IS NOT NULL;

CREATE TABLE incident_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  edited_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX incident_updates_incident_created_idx ON incident_updates (incident_id, created_at);

CREATE TABLE incident_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  new_status text NOT NULL,
  UNIQUE (incident_id, component_id)
);

CREATE INDEX incident_components_component_idx ON incident_components (component_id);

CREATE TABLE template_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE incident_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  group_id uuid REFERENCES template_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  default_status text NOT NULL,
  default_impact text NOT NULL,
  default_component_ids uuid[] NOT NULL DEFAULT '{}',
  kind text NOT NULL DEFAULT 'INCIDENT' CHECK (kind IN ('INCIDENT', 'UPDATE', 'RESOLUTION', 'MAINTENANCE', 'POSTMORTEM')),
  variables text[] NOT NULL DEFAULT '{}',
  notify_by_default boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incident_templates_page_group_idx ON incident_templates (page_id, group_id);

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact text NOT NULL,
  component_ids uuid[] NOT NULL DEFAULT '{}',
  event_types text[] NOT NULL DEFAULT '{}',
  verified boolean NOT NULL DEFAULT false,
  quarantined boolean NOT NULL DEFAULT false,
  unsubscribe_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, channel, contact)
);

CREATE TABLE subscription_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact text NOT NULL,
  code_hash text NOT NULL,
  component_ids uuid[] NOT NULL DEFAULT '{}',
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscription_otps_lookup_idx ON subscription_otps (page_id, channel, contact, expires_at);

CREATE TABLE metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  component_id uuid REFERENCES components(id) ON DELETE SET NULL,
  name text NOT NULL,
  suffix text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  visible boolean NOT NULL DEFAULT true,
  decimals integer NOT NULL DEFAULT 0
);

CREATE INDEX metrics_page_idx ON metrics (page_id);

CREATE TABLE metric_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  value double precision NOT NULL
);

CREATE INDEX metric_points_metric_timestamp_idx ON metric_points (metric_id, timestamp);

CREATE TABLE monitor_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL,
  type text NOT NULL,
  target text NOT NULL,
  port integer,
  expected_status_range text NOT NULL,
  keyword_match text,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  template_id uuid REFERENCES monitor_templates(id) ON DELETE SET NULL,
  component_id uuid REFERENCES components(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  target text NOT NULL,
  port integer,
  method text NOT NULL DEFAULT 'GET',
  request_body text,
  request_headers text NOT NULL DEFAULT '{}',
  expected_status_range text NOT NULL DEFAULT '200-299',
  keyword_match text,
  keyword_absent text,
  ssl_warn_days integer,
  auth_type text NOT NULL DEFAULT 'NONE',
  auth_username text,
  auth_secret text,
  auth_header_name text,
  verify_tls boolean NOT NULL DEFAULT true,
  interval_sec integer NOT NULL,
  timeout_ms integer NOT NULL,
  fail_threshold integer NOT NULL DEFAULT 1,
  recover_threshold integer NOT NULL DEFAULT 1,
  down_status text NOT NULL,
  action_flip_status boolean NOT NULL DEFAULT true,
  action_record_metric boolean NOT NULL DEFAULT false,
  action_auto_incident boolean NOT NULL DEFAULT false,
  action_notify boolean NOT NULL DEFAULT true,
  metric_id uuid REFERENCES metrics(id) ON DELETE SET NULL,
  last_checked_at timestamptz,
  last_latency_ms integer,
  last_ok boolean,
  last_error text,
  consecutive_fails integer NOT NULL DEFAULT 0,
  consecutive_oks integer NOT NULL DEFAULT 0,
  is_down boolean NOT NULL DEFAULT false,
  current_incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  run_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  tags text[] NOT NULL DEFAULT '{}',
  group_name text,
  heartbeat_token_hash text,
  heartbeat_grace_sec integer,
  last_heartbeat_at timestamptz,
  dns_record_type text,
  dns_expected_value text
);

CREATE INDEX monitors_page_idx ON monitors (page_id);
CREATE INDEX monitors_due_idx ON monitors (enabled, last_checked_at, lease_expires_at);
CREATE UNIQUE INDEX monitors_heartbeat_token_idx ON monitors (heartbeat_token_hash) WHERE heartbeat_token_hash IS NOT NULL;

CREATE TABLE monitor_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL,
  ok boolean NOT NULL,
  latency_ms integer,
  status_code integer,
  error text
);

CREATE INDEX monitor_checks_monitor_checked_idx ON monitor_checks (monitor_id, checked_at DESC);
CREATE INDEX monitor_checks_checked_idx ON monitor_checks (checked_at);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('LOGO', 'FAVICON', 'COVER')),
  storage_driver text NOT NULL CHECK (storage_driver IN ('LOCAL', 'S3')),
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  width integer,
  height integer,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX assets_page_kind_deleted_idx ON assets (page_id, kind, deleted_at);

CREATE TABLE notification_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL,
  config_ciphertext text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  event_types text[] NOT NULL DEFAULT '{}',
  component_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_destinations_page_channel_idx ON notification_destinations (page_id, channel);

CREATE TABLE platform_configuration (
  id text PRIMARY KEY CHECK (id = 'global'),
  enabled_destination_channels text[] NOT NULL DEFAULT '{}',
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_daily (
  id text PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  date date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  incident_views integer NOT NULL DEFAULT 0,
  subscription_starts integer NOT NULL DEFAULT 0,
  subscription_completions integer NOT NULL DEFAULT 0,
  referrers jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, date)
);

CREATE INDEX analytics_daily_page_date_idx ON analytics_daily (page_id, date DESC);
CREATE INDEX analytics_daily_expiry_idx ON analytics_daily (expires_at);

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret_hash text NOT NULL,
  secret_ciphertext text NOT NULL,
  secret_prefix text NOT NULL,
  secret_last_four text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  verification_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_endpoints_page_active_idx ON webhook_endpoints (page_id, active, verified_at);

CREATE TABLE notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL,
  response_status integer,
  error text,
  attempt integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_logs_page_created_idx ON notification_logs (page_id, created_at DESC);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  subscriber_id uuid REFERENCES subscribers(id) ON DELETE SET NULL,
  endpoint_id uuid REFERENCES webhook_endpoints(id) ON DELETE SET NULL,
  destination_id uuid REFERENCES notification_destinations(id) ON DELETE SET NULL,
  channel text NOT NULL,
  contact text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER', 'BLOCKED')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  response_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX notification_jobs_queue_idx ON notification_jobs (status, next_attempt_at, lease_expires_at);
CREATE INDEX notification_jobs_page_updated_idx ON notification_jobs (page_id, updated_at DESC);

CREATE TABLE worker_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTING', 'READY', 'STOPPING')),
  last_loop_at timestamptz,
  last_error text
);

CREATE INDEX worker_heartbeats_seen_idx ON worker_heartbeats (last_seen_at);

CREATE TABLE feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  last_four text NOT NULL,
  component_ids uuid[],
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX feed_tokens_page_active_idx ON feed_tokens (page_id, revoked_at);

CREATE TABLE rate_limits (
  id text PRIMARY KEY,
  count integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX rate_limits_expiry_idx ON rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL
);
