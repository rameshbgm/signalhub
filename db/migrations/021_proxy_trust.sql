-- Installation-wide choice of whether to believe X-Forwarded-For when working
-- out the client address: auto (private/loopback peers only), on, or off.
-- TRUST_PROXY_HEADERS / TRUSTED_PROXY_HOPS in the environment still win.
ALTER TABLE platform_configuration
  ADD COLUMN proxy_trust_mode text NOT NULL DEFAULT 'auto'
    CHECK (proxy_trust_mode IN ('auto', 'on', 'off')),
  ADD COLUMN proxy_trusted_hops integer NOT NULL DEFAULT 1
    CHECK (proxy_trusted_hops BETWEEN 1 AND 10);
