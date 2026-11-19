-- Better Auth 1.7.25 schema. Only creates independent authentication tables.
-- Prefer `pnpm admin:check` then `pnpm admin:migrate` for existing databases.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isEnabled" boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS admin_session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS admin_account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_session_userId_idx" ON admin_session("userId");
CREATE INDEX IF NOT EXISTS "admin_account_userId_idx" ON admin_account("userId");
CREATE INDEX IF NOT EXISTS "admin_verification_identifier_idx" ON admin_verification(identifier);
COMMIT;
