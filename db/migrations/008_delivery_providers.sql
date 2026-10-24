-- Subscriber email (SMTP) and SMS (Twilio) providers move from deployment
-- environment variables to installation configuration managed in the platform
-- console. Secrets are stored as application-encrypted ciphertext.
-- updated_by becomes nullable so the one-time import of legacy environment
-- values can be recorded as a system change.
ALTER TABLE platform_configuration
  ALTER COLUMN updated_by DROP NOT NULL,
  ADD COLUMN smtp_host text,
  ADD COLUMN smtp_port integer CHECK (smtp_port BETWEEN 1 AND 65535),
  ADD COLUMN smtp_secure boolean NOT NULL DEFAULT false,
  ADD COLUMN smtp_username text,
  ADD COLUMN smtp_password_ciphertext text,
  ADD COLUMN smtp_from text,
  ADD COLUMN twilio_account_sid text,
  ADD COLUMN twilio_auth_token_ciphertext text,
  ADD COLUMN twilio_from_number text;
