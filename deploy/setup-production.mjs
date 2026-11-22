import { readFile, access, readdir, lstat, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { parseEnv, parseArgs } from 'node:util'
import { randomBytes, X509Certificate, createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function productionOrigin(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('请提供完整的网站地址，例如 https://tools.example.com 或 http://43.143.85.207。') }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const supported = url.protocol === 'https:' || (url.protocol === 'http:' && isIP(hostname) !== 0)
  const loopback = hostname === 'localhost' || hostname.startsWith('127.') || ['0.0.0.0', '::', '::1'].includes(hostname)
  if (!supported || loopback || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('网站地址须为 HTTPS 或临时 HTTP IP 地址，不含路径或登录信息。')
  }
  return url.origin
}

export function runtimeConfig(env, origin) {
  let database
  try { database = new URL(env.DATABASE_URL) } catch { throw new Error('本地 .env 未配置有效的 DATABASE_URL。') }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.username || !database.password || database.pathname.length <= 1) {
    throw new Error('DATABASE_URL 必须包含 PostgreSQL 用户名、密码和数据库名称。')
  }
  const identity = env.DB_TLS_IDENTITY?.trim() || database.hostname
  if (!identity || /[\s\0]/.test(identity)) throw new Error('数据库证书身份无效。')
  database.hostname = 'postgresql'
  database.port = '5432'
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) database.searchParams.delete(key)
  const secret = env.BETTER_AUTH_SECRET || randomBytes(48).toString('base64url')
  if (secret.length < 32) throw new Error('已有 BETTER_AUTH_SECRET 长度不足 32 字符，请先修正本地配置。')
  return {
    DATABASE_URL: database.toString(),
    DB_TLS_IDENTITY: identity,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: productionOrigin(origin),
  }
}

export function rawEnv(values) {
  return Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n\0]/.test(value)) throw new Error('运行时配置包含不支持的换行或控制字符。')
    return `${key}=${value}`
  }).join('\n') + '\n'
}

export function sshSettings(options) {
  const host = options.host || '43.143.85.207'
  const user = options.user || 'ubuntu'
  const port = options.port || '22'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) || !/^[a-z_][a-z0-9_-]*$/.test(user) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('SSH 主机、用户名或端口格式无效。')
  }
  return {host, user, port, key: resolve(options.key || join(homedir(), '.ssh', 'ai-tools-deploy'))}
}

async function localEnvironment() {
  const env = {}
  for (const name of ['.env', '.env.local']) {
    try { Object.assign(env, parseEnv(await readFile(join(root, name), 'utf8'))) }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(`无法读取 ${name}。`) }
  }
  return env
}

export async function mediaManifest(directory) {
  const entries = []
  if (!(await lstat(directory)).isDirectory()) throw new Error('本地素材根路径必须是目录。')
  async function visit(folder, prefix = '') {
    for (const name of await readdir(folder)) {
      const relative = prefix ? `${prefix}/${name}` : name
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(relative) || relative.split('/').some(part => part === '.' || part === '..')) throw new Error('本地素材包含不支持的文件名。')
      const info = await lstat(join(folder, name))
      if (info.isSymbolicLink()) throw new Error('本地素材包含符号链接，已停止同步。')
      if (info.isDirectory()) await visit(join(folder, name), relative)
      else if (info.isFile()) entries.push(`${createHash('sha256').update(await readFile(join(folder, name))).digest('hex')}  ${relative}`)
      else throw new Error('本地素材包含不支持的文件类型。')
    }
  }
  await visit(directory)
  return entries.sort().join('\n') + (entries.length ? '\n' : '')
}

async function seedMedia(sshArgs) {
  const media = join(root, 'storage', 'media')
  try { await access(media) } catch { console.log('没有本地上传素材，跳过首次同步。'); return }
  const manifest = await mediaManifest(media)
  if (!manifest) { console.log('本地上传目录为空，跳过首次同步。'); return }
  const stage = await mkdtemp(join(tmpdir(), 'ai-tools-media-'))
  try {
    await writeFile(join(stage, 'media.sha256'), manifest, {mode: 0o600})
    console.log(`首次同步 ${manifest.trimEnd().split('\n').length} 个素材文件，按 SHA-256 校验且不覆盖冲突文件。`)
    await new Promise((done, fail) => {
      const remote = spawn('ssh', [...sshArgs, 'bash /opt/projects/ai-tools/deploy/seed-media.sh'], {stdio: ['pipe', 'inherit', 'inherit'], shell: false})
      const archive = spawn('tar', ['-czf', '-', '-C', join(root, 'storage'), 'media', '-C', stage, 'media.sha256'], {stdio: ['ignore', 'pipe', 'inherit'], shell: false})
      const failure = () => { archive.kill(); remote.kill(); fail(new Error('素材同步未完成，可重新运行初始化命令；已有文件保留。')) }
      let archiveDone = false, remoteDone = false
      const finish = () => { if (archiveDone && remoteDone) done() }
      archive.on('error', failure)
      remote.on('error', failure)
      remote.stdin.on('error', () => {})
      archive.on('exit', code => { if (code !== 0) failure(); else { archiveDone = true; finish() } })
      remote.on('exit', code => { if (code !== 0) failure(); else { remoteDone = true; finish() } })
      archive.stdout.pipe(remote.stdin)
    })
  } finally { await rm(stage, {recursive: true, force: true}) }
}

async function main() {
  const {values} = parseArgs({options: {
    origin: {type: 'string'}, host: {type: 'string'}, user: {type: 'string'}, port: {type: 'string'}, key: {type: 'string'},
    'dry-run': {type: 'boolean'}, help: {type: 'boolean'},
  }})
  if (values.help) {
    console.log('pnpm deploy:setup [--origin https://tools.example.com] [--dry-run]\n首次输入网站地址（支持 HTTPS，或 HTTP IP 预览）；自动复用本地数据库凭据和 CA。仅准备环境，不执行发布或迁移。\nSSH 默认 ubuntu@43.143.85.207:22，密钥 ~/.ssh/ai-tools-deploy；可用 --host/--user/--port/--key 修改。')
    return
  }
  const ssh = sshSettings(values)
  const env = await localEnvironment()
  let origin = values.origin
  if (!origin) {
    try { origin = productionOrigin(env.BETTER_AUTH_URL) } catch {
      if (!process.stdin.isTTY) throw new Error('请使用 --origin 指定网站地址。')
      const prompt = createInterface({input: process.stdin, output: process.stdout})
      try { origin = await prompt.question('网站地址（例如 https://tools.example.com；IP 预览填 http://43.143.85.207）：') } finally { prompt.close() }
    }
  }
  const runtime = runtimeConfig(env, origin)
  const preview = runtime.BETTER_AUTH_URL.startsWith('http:')
  const certificate = env.DB_CA_CERT?.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!certificate) throw new Error('本地 .env 缺少 DB_CA_CERT。')
  let ca
  try { ca = certificate.includes('-----BEGIN CERTIFICATE-----') ? certificate : await readFile(resolve(root, certificate), 'utf8') }
  catch { throw new Error('无法读取本地 DB_CA_CERT 指向的 CA 文件。') }
  try { if (!new X509Certificate(ca).ca) throw new Error() } catch { throw new Error('DB_CA_CERT 必须是有效的 CA 公有证书。') }
  await access(ssh.key).catch(() => { throw new Error('找不到部署 SSH 私钥，请用 --key 指定文件。') })
  console.log(`目标：${ssh.user}@${ssh.host}:${ssh.port}`)
  console.log(`网站：${runtime.BETTER_AUTH_URL}`)
  console.log('数据库：内部网络 postgresql:5432；证书链和身份校验开启。')
  if (preview) console.log('HTTP IP 模式用于公开页面预览。配置 HTTPS 前，请勿通过公网输入真实账号或后台密码。')
  if (values['dry-run']) {
    console.log('预览通过；未连接服务器，未写入环境文件，未执行部署。')
    return
  }
  const files = {
    RUNTIME_B64: rawEnv(runtime),
    CA_B64: ca.replace(/\r\n/g, '\n'),
    COMPOSE_B64: await readFile(join(root, 'docker-compose.yml'), 'utf8'),
    DEPLOY_B64: await readFile(join(root, 'deploy/deploy.sh'), 'utf8'),
    RELEASE_B64: await readFile(join(root, 'deploy/remote-release.sh'), 'utf8'),
    MEDIA_B64: await readFile(join(root, 'deploy/seed-media.sh'), 'utf8'),
    IDENTITY_B64: runtime.DB_TLS_IDENTITY,
  }
  const prefix = Object.entries(files).map(([key, value]) => `${key}='${Buffer.from(value).toString('base64')}'`).join('\n')
  const remote = await readFile(join(root, 'deploy/setup-server.sh'), 'utf8')
  const input = `${prefix}\nIDENTITY_KIND='${isIP(runtime.DB_TLS_IDENTITY) ? 'ip' : 'hostname'}'\n${remote.replace(/\r\n/g, '\n')}`
  const args = ['-i', ssh.key, '-p', ssh.port, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', `${ssh.user}@${ssh.host}`]
  const setupStatus = await new Promise((done, fail) => {
    const child = spawn('ssh', [...args, 'bash -s'], {stdio: ['pipe', 'inherit', 'inherit'], shell: false})
    child.on('error', () => fail(new Error('无法启动 SSH，请确认本机已安装 OpenSSH。')))
    child.stdin.on('error', () => {})
    child.on('exit', code => (code === 0 || code === 20) ? done(code) : fail(new Error('服务器初始化未完成，请查看上方不含密码的检查结果。')))
    child.stdin.end(input)
  })
  if (setupStatus === 20) { console.log('保留已有生产部署，本次未改变运行配置或同步素材。'); return }
  await seedMedia(args)
  console.log('\n初始化完成。1Panel 反向代理目标：http://127.0.0.1:13000')
  if (preview) console.log(`在 1Panel 使用 IP ${new URL(runtime.BETTER_AUTH_URL).hostname} 创建 HTTP 反向代理网站。`)
  else console.log(`网站使用 ${runtime.BETTER_AUTH_URL}，在 1Panel 启用 HTTPS。`)
  console.log('接下来推送本次配置到 main，由 GitHub Actions 构建并部署；无需单独配置服务器 GHCR token。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
