-- Network ranges whose connections may tell us the visitor's address through
-- X-Forwarded-For. Empty = the default: loopback and private addresses (Auto)
-- or any connection (On). TRUSTED_PROXY_CIDRS in the environment overrides.
ALTER TABLE platform_configuration
  ADD COLUMN proxy_trusted_cidrs text[] NOT NULL DEFAULT '{}';
