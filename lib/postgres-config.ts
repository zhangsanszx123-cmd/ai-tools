import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkServerIdentity, type PeerCertificate } from 'node:tls'
import type { PoolConfig } from 'pg'

// pg URL options must not override the explicit CA and verification settings.
export function postgresConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  const url = new URL(env.DATABASE_URL)
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(key)
  const certificate = env.DB_CA_CERT?.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim()
  const ca = certificate
    ? certificate.includes('-----BEGIN CERTIFICATE-----') ? certificate : readFileSync(resolve(certificate), 'utf8')
    : undefined
  // Keep certificate-chain verification; optionally verify an identity distinct from routing DNS.
  const identity = env.DB_TLS_IDENTITY?.trim()
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
      ...(identity ? { checkServerIdentity: (_hostname: string, peerCertificate: PeerCertificate) => checkServerIdentity(identity, peerCertificate) } : {}),
    },
    max: 4, connectionTimeoutMillis: 10000, statement_timeout: 15000, idleTimeoutMillis: 30000,
  }
}
