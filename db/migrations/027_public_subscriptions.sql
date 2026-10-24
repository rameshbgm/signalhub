ALTER TABLE pages ADD COLUMN public_subscriptions_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE platform_configuration ADD COLUMN public_subscriptions_enabled boolean NOT NULL DEFAULT true;
