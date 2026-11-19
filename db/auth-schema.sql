-- Better Auth 1.7.25 schema. Only creates independent authentication tables.
-- Prefer `pnpm auth:check` then `pnpm auth:migrate` for existing databases.
BEGIN;
CREATE TABLE IF NOT EXISTS ai_directory_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role text NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS ai_directory_sessions (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES ai_directory_users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ai_directory_accounts (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES ai_directory_users(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS ai_directory_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ai_directory_rate_limits (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "ai_directory_sessions_userId_idx" ON ai_directory_sessions("userId");
CREATE INDEX IF NOT EXISTS "ai_directory_accounts_userId_idx" ON ai_directory_accounts("userId");
CREATE INDEX IF NOT EXISTS "ai_directory_verifications_identifier_idx" ON ai_directory_verifications(identifier);
COMMIT;
