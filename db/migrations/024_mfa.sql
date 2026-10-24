-- Authenticator MFA with up to two devices per user, hashed single-use recovery
-- codes, trusted browsers, a sign-in challenge (no session exists between the
-- password and the code), and admin-approved removal requests.

CREATE TABLE mfa_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'TOTP' CHECK (type IN ('TOTP')),
  name text NOT NULL,
  secret_ciphertext text NOT NULL,
  -- HMAC of the secret: the same authenticator can never be registered twice.
  -- Null only for devices carried over from the single-secret design.
  secret_hash text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE')),
  pending_expires_at timestamptz,
  last_step integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX mfa_devices_user_idx ON mfa_devices (user_id, status);

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_idx ON mfa_recovery_codes (user_id);
CREATE INDEX mfa_recovery_codes_hash_idx ON mfa_recovery_codes (code_hash);

-- Encrypted copy of freshly generated recovery codes, kept for a few minutes so
-- "Email to me" never needs the browser to send codes back. Deleted on acknowledge.
CREATE TABLE mfa_recovery_reveals (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  emails_sent integer NOT NULL DEFAULT 0
);

CREATE TABLE mfa_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX mfa_trusted_devices_user_idx ON mfa_trusted_devices (user_id);

CREATE TABLE mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('CODE', 'ENROLL')),
  org_id uuid,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX mfa_challenges_expires_idx ON mfa_challenges (expires_at);

ALTER TABLE users
  ADD COLUMN mfa_reenroll_required boolean NOT NULL DEFAULT false,
  ADD COLUMN mfa_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN mfa_locked_until timestamptz;

-- When the session last proved possession of a device (the "within 5 minutes" check).
ALTER TABLE auth_sessions ADD COLUMN mfa_step_up_at timestamptz;

CREATE TABLE mfa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('REMOVE_ALL', 'LOST_DEVICE')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  ip_address text,
  user_agent text,
  cancel_token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  break_glass boolean NOT NULL DEFAULT false
);
-- One pending request per user, enforced by the database.
CREATE UNIQUE INDEX mfa_requests_one_pending_idx ON mfa_requests (user_id) WHERE status = 'PENDING';
CREATE INDEX mfa_requests_status_idx ON mfa_requests (status, created_at DESC);

-- Carry over the single-secret enrolment: one active device plus its codes.
INSERT INTO mfa_devices (user_id, name, secret_ciphertext, status, last_step, created_at)
SELECT id, 'Authenticator', totp_secret_ciphertext, 'ACTIVE', totp_last_step, COALESCE(mfa_enrolled_at, now())
FROM users WHERE totp_secret_ciphertext IS NOT NULL;

INSERT INTO mfa_recovery_codes (user_id, code_hash)
SELECT id, unnest(recovery_code_hashes) FROM users
WHERE totp_secret_ciphertext IS NOT NULL AND cardinality(recovery_code_hashes) > 0;
