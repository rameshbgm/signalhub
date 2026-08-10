-- Identity and business invariants used by authentication and idempotent jobs.
CREATE UNIQUE INDEX users_oidc_identity_unique_idx
  ON users (oidc_issuer, oidc_subject)
  WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;

CREATE UNIQUE INDEX data_export_jobs_one_active_per_org_idx
  ON data_export_jobs (org_id)
  WHERE status IN ('QUEUED', 'PROCESSING');

CREATE UNIQUE INDEX monitors_page_template_unique_idx
  ON monitors (page_id, template_id)
  WHERE template_id IS NOT NULL;

-- Hot read and lifecycle paths.
CREATE INDEX pages_org_active_name_idx
  ON pages (org_id, name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX memberships_active_admin_user_idx
  ON memberships (user_id)
  WHERE role = 'ADMIN' AND status = 'ACTIVE';

CREATE INDEX audit_logs_unsealed_idx
  ON audit_logs (org_id, created_at, id)
  WHERE entry_hash IS NULL;

CREATE INDEX platform_audit_logs_unsealed_idx
  ON platform_audit_logs (created_at, id)
  WHERE entry_hash IS NULL;

CREATE INDEX notification_jobs_retention_idx
  ON notification_jobs (updated_at)
  WHERE status IN ('SENT', 'DEAD_LETTER');

CREATE INDEX assets_page_public_url_active_idx
  ON assets (page_id, public_url)
  WHERE deleted_at IS NULL;

-- PostgreSQL does not automatically index referencing columns. These indexes
-- keep parent updates/deletes and FK cascades from scanning child tables.
CREATE INDEX auth_sessions_membership_idx ON auth_sessions (membership_id);
CREATE INDEX auth_sessions_org_idx ON auth_sessions (org_id);
CREATE INDEX support_sessions_platform_admin_idx ON support_sessions (platform_admin_id);
CREATE INDEX support_sessions_org_idx ON support_sessions (org_id);
CREATE INDEX support_sessions_revoked_by_idx ON support_sessions (revoked_by) WHERE revoked_by IS NOT NULL;
CREATE INDEX organizations_status_changed_by_idx ON organizations (status_changed_by) WHERE status_changed_by IS NOT NULL;
CREATE INDEX platform_jobs_requested_by_idx ON platform_jobs (requested_by);
CREATE INDEX organization_tombstones_requested_by_idx ON organization_tombstones (requested_by);
CREATE INDEX api_keys_created_by_idx ON api_keys (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX audit_logs_support_session_idx ON audit_logs (support_session_id) WHERE support_session_id IS NOT NULL;
CREATE INDEX identity_connections_created_by_idx ON identity_connections (created_by);
CREATE INDEX identity_connections_org_idx ON identity_connections (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX external_identities_user_idx ON external_identities (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX scim_tokens_created_by_idx ON scim_tokens (created_by);
CREATE INDEX retention_policies_updated_by_idx ON retention_policies (updated_by);
CREATE INDEX data_export_jobs_requested_by_idx ON data_export_jobs (requested_by);
CREATE INDEX audit_sinks_created_by_idx ON audit_sinks (created_by);
CREATE INDEX audit_delivery_jobs_sink_idx ON audit_delivery_jobs (sink_id);
CREATE INDEX pages_deleted_by_idx ON pages (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX page_design_drafts_updated_by_idx ON page_design_drafts (updated_by);
CREATE INDEX page_design_versions_published_by_idx ON page_design_versions (published_by);
CREATE INDEX page_announcements_created_by_idx ON page_announcements (created_by);
CREATE INDEX page_access_groups_page_idx ON page_access_groups (page_id);
CREATE INDEX page_access_users_group_idx ON page_access_users (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX incident_updates_edited_by_idx ON incident_updates (edited_by) WHERE edited_by IS NOT NULL;
CREATE INDEX template_groups_page_idx ON template_groups (page_id);
CREATE INDEX incident_templates_group_idx ON incident_templates (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX metrics_component_idx ON metrics (component_id) WHERE component_id IS NOT NULL;
CREATE INDEX monitors_template_idx ON monitors (template_id) WHERE template_id IS NOT NULL;
CREATE INDEX monitors_component_idx ON monitors (component_id) WHERE component_id IS NOT NULL;
CREATE INDEX monitors_metric_idx ON monitors (metric_id) WHERE metric_id IS NOT NULL;
CREATE INDEX monitors_current_incident_idx ON monitors (current_incident_id) WHERE current_incident_id IS NOT NULL;
CREATE INDEX assets_org_idx ON assets (org_id);
CREATE INDEX assets_created_by_idx ON assets (created_by);
CREATE INDEX platform_configuration_updated_by_idx ON platform_configuration (updated_by);
CREATE INDEX notification_jobs_subscriber_idx ON notification_jobs (subscriber_id) WHERE subscriber_id IS NOT NULL;
CREATE INDEX notification_jobs_endpoint_idx ON notification_jobs (endpoint_id) WHERE endpoint_id IS NOT NULL;
CREATE INDEX notification_jobs_destination_idx ON notification_jobs (destination_id) WHERE destination_id IS NOT NULL;
CREATE INDEX feed_tokens_created_by_idx ON feed_tokens (created_by);
