// Operational probe: HTTP server plus verified TLS database connection; no DDL.
const { readFileSync } = require('node:fs');
const { checkServerIdentity } = require('node:tls');
const { Client } = require('pg');
(async () => {
  const response = await fetch('http://127.0.0.1:3000/login', { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('HTTP unhealthy');
  const url = new URL(process.env.DATABASE_URL);
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(key);
  const identity = process.env.DB_TLS_IDENTITY?.trim();
  const client = new Client({
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(process.env.DB_CA_CERT, 'utf8'),
      ...(identity ? { checkServerIdentity: (_hostname, certificate) => checkServerIdentity(identity, certificate) } : {}),
    },
    connectionTimeoutMillis: 4000, statement_timeout: 4000,
  });
  try { await client.connect(); await client.query('SELECT 1'); } finally { await client.end(); }
})().catch(() => { console.error('Application readiness check failed'); process.exit(1); });
