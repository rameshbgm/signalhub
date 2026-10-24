-- Admin-controlled installation settings (see lib/settings/registry.ts), saved as
-- one JSON object so a new setting needs no migration. Environment variables
-- still override each value. settings_pending holds a change that has to be
-- confirmed before a deadline, or it is reverted (changes that could lock the
-- administrator out).
ALTER TABLE platform_configuration
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN settings_pending jsonb;
