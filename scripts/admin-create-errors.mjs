const messages = {
  AUTH_NOT_CONFIGURED: 'BETTER_AUTH_SECRET 未配置或不足 32 个字符，请检查本地环境配置。',
  INVALID_EMAIL: '邮箱格式不正确，请输入有效的邮箱地址。',
  PASSWORD_TOO_SHORT: '密码至少需要 12 个字符，请重新运行并设置更长的密码。',
  PASSWORD_TOO_LONG: '密码不能超过 128 个字符。',
  PASSWORD_MISMATCH: '两次输入的密码不一致，请重新运行并重新确认。',
  USER_ALREADY_EXISTS: '该邮箱已有独立后台账号，未覆盖原账号或密码。',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '该邮箱已有独立后台账号，未覆盖原账号或密码。',
  '23505': '该后台账号已存在，未覆盖原账号或密码。',
  '42P01': '后台认证表不存在，请先执行 pnpm admin:migrate。',
  '42703': '后台认证表结构不完整，请核对后台建表脚本。',
  '42501': '数据库账号没有创建后台用户所需的读写权限。',
  '28P01': '数据库账号或密码认证失败，请检查 DATABASE_URL。',
  ECONNREFUSED: '数据库连接被拒绝，请检查数据库服务、地址和端口。',
  ENOTFOUND: '无法解析数据库主机，请检查数据库地址和网络。',
  ETIMEDOUT: '数据库连接超时，请检查网络或数据库白名单。',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: '数据库证书校验失败，请检查 DB_CA_CERT 及证书链。',
  SELF_SIGNED_CERT_IN_CHAIN: '数据库证书链不受信任，请检查 DB_CA_CERT。',
  CERT_HAS_EXPIRED: '数据库 TLS 证书已过期。',
  ERR_TLS_CERT_ALTNAME_INVALID: '数据库证书中的主机名与连接地址不一致。',
  TARGET_SCHEMA_MISMATCH: '数据库 schema 不符合预期，已停止创建账号。',
  ERR_USE_AFTER_CLOSE: '输入已提前结束，请在交互式终端中重新执行 pnpm admin:create。',
}

export function validateAdminCredentials(email, password, confirmation) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('INVALID_EMAIL')
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT')
  if (password.length > 128) throw new Error('PASSWORD_TOO_LONG')
  if (password !== confirmation) throw new Error('PASSWORD_MISMATCH')
}

export function adminCreationError(error) {
  // Only allowlisted codes produce messages. Never print arbitrary driver/API messages,
  // which may contain SQL, credentials, passwords or request data.
  const visited = new Set()
  for (let cause = error; cause && typeof cause === 'object' && !visited.has(cause); cause = cause.cause) {
    visited.add(cause)
    for (const code of [cause.body?.code, cause.code, cause.message]) {
      if (Object.hasOwn(messages, code ?? '')) return { code, message: messages[code] }
    }
  }
  return { code: 'UNKNOWN', message: '创建未完成，未输出敏感错误详情。请检查数据库连接与后台认证表配置。' }
}
