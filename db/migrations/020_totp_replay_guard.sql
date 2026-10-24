-- The last accepted TOTP time step (unix time / 30 s) per user, so an
-- authenticator code cannot be replayed within its validity window
-- (RFC 6238 section 5.2).
ALTER TABLE users ADD COLUMN totp_last_step integer;
