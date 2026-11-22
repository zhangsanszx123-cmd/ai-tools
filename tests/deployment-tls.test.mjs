import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import tls from 'node:tls'
import {postgresConfig} from '../lib/postgres-config.ts'

test('explicit database identity verifies real TLS while rejecting wrong names and untrusted CA', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-tools-tls-'))
  const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl')
  const file = name => join(dir, name)
  const run = args => execFileSync(openssl, args, {stdio: 'ignore'})
  let server
  try {
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Temporary deployment test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', file('ca.key'), '-out', file('ca.pem')])
    run(['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=43.143.85.207', '-keyout', file('server.key'), '-out', file('server.csr')])
    await writeFile(file('server.ext'), 'subjectAltName=IP:43.143.85.207\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n')
    run(['x509', '-req', '-in', file('server.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-days', '1', '-extfile', file('server.ext'), '-out', file('server.pem')])
    const ca = await readFile(file('ca.pem'), 'utf8')
    server = tls.createServer({key: await readFile(file('server.key')), cert: await readFile(file('server.pem'))}, socket => socket.end())
    server.on('tlsClientError', () => {})
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = server.address().port
    const connect = ssl => new Promise((resolve, reject) => {
      const socket = tls.connect({host: '127.0.0.1', port, servername: 'postgresql', ...ssl}, () => { socket.end(); resolve() })
      socket.once('error', reject)
      socket.setTimeout(3000, () => socket.destroy(new Error('TLS test timeout')))
    })
    const config = identity => postgresConfig({DATABASE_URL: 'postgresql://user:password@postgresql/db', DB_CA_CERT: ca, DB_TLS_IDENTITY: identity}).ssl
    await connect(config('43.143.85.207'))
    await assert.rejects(connect(config('43.143.85.208')), {code: 'ERR_TLS_CERT_ALTNAME_INVALID'})
    await assert.rejects(connect(config(undefined)), {code: 'ERR_TLS_CERT_ALTNAME_INVALID'})
    await assert.rejects(connect({...config('43.143.85.207'), ca: undefined}), error => ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code))
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve))
    await rm(dir, {recursive: true, force: true})
  }
})
