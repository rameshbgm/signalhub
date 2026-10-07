-- SMS delivery supports several providers that all need an account id, a
-- secret and a sender, so the Twilio-specific columns become generic.
ALTER TABLE platform_configuration RENAME COLUMN twilio_account_sid TO sms_account_id;
ALTER TABLE platform_configuration RENAME COLUMN twilio_auth_token_ciphertext TO sms_secret_ciphertext;
ALTER TABLE platform_configuration RENAME COLUMN twilio_from_number TO sms_from;
ALTER TABLE platform_configuration
  ADD COLUMN sms_provider text NOT NULL DEFAULT 'TWILIO'
  CHECK (sms_provider IN ('TWILIO', 'VONAGE', 'PLIVO', 'TELNYX'));
