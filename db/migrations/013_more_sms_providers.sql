-- More SMS providers for subscriber delivery.
ALTER TABLE platform_configuration DROP CONSTRAINT IF EXISTS platform_configuration_sms_provider_check;
ALTER TABLE platform_configuration ADD CONSTRAINT platform_configuration_sms_provider_check
  CHECK (sms_provider IN ('TWILIO', 'VONAGE', 'PLIVO', 'TELNYX', 'SINCH', 'CLICKSEND', 'TEXTMAGIC', 'AFRICASTALKING'));
