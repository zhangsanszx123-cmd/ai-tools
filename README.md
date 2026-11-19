# AI 工具导航

## 本地运行

1. 安装依赖：`pnpm install`。
2. 参考 [.env.example](./.env.example) 配置环境变量。数据库可继续放在已有 `.env` 中，`.env.local` 仅填写需要覆盖或新增的配置，不要用空值覆盖现有数据库连接。配置 `DATABASE_URL` 和 `DB_CA_CERT`；CA 支持 PEM、包含 `\n` 的 PEM 或证书文件路径。所有数据库连接始终校验 SSL 证书，不要将凭据提交到版本控制或发到聊天中。
3. 对于新数据库，在数据库的 SQL 编辑器执行 [db/schema.sql](./db/schema.sql)。已有数据库请先确认表结构与 [lib/directory-db.ts](./lib/directory-db.ts) 一致；该脚本不会修改已有表。
4. 执行 `pnpm dev`。修改环境配置后需重启开发服务。

首页仅展示 `ai_directory_tools` 中 `status = 'published'` 的记录。新建表为空时显示空目录；需要添加真实工具数据后才会出现卡片。`featured_order` 非空的工具进入热门列表，按数值升序排列；`published_at` 用于最新收录排序。

## 登录与投稿

登录注册参考 [Next.js with-supabase 示例](https://github.com/vercel/next.js/tree/canary/examples/with-supabase) 的表单、密码确认、Cookie 会话与页面保护流程，后端使用 Better Auth + 当前 PostgreSQL，不需要 Supabase 或 Neon Auth 服务。

1. 配置 `BETTER_AUTH_SECRET`（至少 32 字符的高熵随机值）和 `BETTER_AUTH_URL`（本地 `http://localhost:3000`；部署后填写实际 HTTPS 域名）。密钥示例生成方式见 [.env.example](./.env.example)，不要每次启动重新生成。
2. 使用 Node.js 22.18+ 或 24，执行 `pnpm auth:check` 只读检查认证表；确认后执行 `pnpm auth:migrate` 创建缺失的认证表和索引。当前账号若没有 `public` 建表权限，但有数据库 CREATE 权限，迁移会创建账号同名的自有 schema，利用默认 `"$user", public` 搜索路径隔离认证表，不改变 `public` 权限。也可审阅并手动运行 [db/auth-schema.sql](./db/auth-schema.sql)。迁移命令拒绝修改已有表的列，不会操作目录表或 Neon Auth 表；应用启动不会自动建表。
3. 访问 `/login` 登录，或 `/login?mode=signup` 注册。注册只需填写邮箱、密码与确认密码，密码为 8–128 字符，昵称自动设为“新用户”。注册成功自动登录，默认进入个人中心；从投稿入口进入时会返回投稿表单。

密码由 Better Auth 使用 scrypt 加盐哈希，不存储明文。会话有效期 7 天，使用 HttpOnly、SameSite=Lax Cookie，HTTPS 生产环境自动加 Secure。退出会撤销数据库会话；受保护页面与服务端操作都验证会话。认证 API 使用数据库持久化限流：每 IP 每分钟最多登录 10 次、注册 5 次。部署时请确保反向代理覆盖客户端传入的地址头。

注册默认为普通用户；客户端不能设置 `role`。管理员由数据库维护者审核后将 `ai_directory_users.role` 设置为 `admin`，应用不提供自行提权入口。现有 Neon Auth 用户不会被自动导入或更改。本次仅实现邮箱密码登录注册，未接入邮件发送，因此不展示不可用的邮件验证或找回密码入口。

验证：`pnpm test:auth` 使用内存数据库测试完整认证生命周期、密码哈希、非法输入、Cookie、跨站防护、限流和 SSL，不会在实际数据库中创建测试用户。另执行 `pnpm exec tsc --noEmit` 和 `pnpm build`。

## 排查目录无法加载

- 开发页面提示数据库未配置：检查 `.env.local` 中的 `DATABASE_URL` 是否为空，并重启服务。
- 服务端日志代码 `42P01`：目录表不存在，执行建表脚本。
- 代码 `42703`：已有表缺少应用所需字段，核对数据库结构。
- 代码 `28P01`：检查连接账号与密码。
- 代码 `ECONNREFUSED`、`ENOTFOUND` 或连接超时：检查主机、端口、网络和数据库状态。

连接失败时页面保留不可用提示；不会将失败伪装成空目录或演示数据。服务端只记录错误代码，避免泄露 SQL、连接字符串和用户数据。
