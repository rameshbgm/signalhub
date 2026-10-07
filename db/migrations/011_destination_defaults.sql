-- Installation-wide defaults for non-secret destination settings (auth mode,
-- severity, region, self-hosted server URLs), keyed by channel then field.
ALTER TABLE platform_configuration
  ADD COLUMN destination_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;
