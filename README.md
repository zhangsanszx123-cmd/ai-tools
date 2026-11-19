# AI 工具导航

## 本地运行

1. 安装依赖：`pnpm install`。
2. 参考 [.env.example](./.env.example) 配置环境变量。数据库可继续放在已有 `.env` 中，`.env.local` 仅填写需要覆盖或新增的配置，不要用空值覆盖现有数据库连接。配置 `DATABASE_URL` 和 `DB_CA_CERT`；CA 支持 PEM、包含 `\n` 的 PEM 或证书文件路径。所有数据库连接始终校验 SSL 证书，不要将凭据提交到版本控制或发到聊天中。
3. 新数据库先按下文初始化认证表，再审阅并执行 [db/directory-v2.sql](./db/directory-v2.sql)，创建分类、正式工具、投稿记录三张业务表，并初始化 17 个分类。现有项目数据库已经完成此步骤，不要重复建表。旧版单表脚本 [db/schema.sql](./db/schema.sql) 已停用；旧结构迁移需参考 [设计文档](./docs/database-design.md)，不可覆盖旧数据。
4. 执行 `pnpm dev`。修改环境配置后需重启开发服务。

首页分类从 `ai_directory_categories` 动态读取，不再依赖代码内置数组。仅展示启用分类下 `ai_directory_tools.status = 'published'` 的工具。没有工具时显示真实空目录，不填充演示数据。`featured_order` 非空的工具进入热门列表，按数值升序排列；`published_at` 用于最新收录；同分类按 `display_order`、收录时间排序。

## 登录与投稿

登录注册参考 [Next.js with-supabase 示例](https://github.com/vercel/next.js/tree/canary/examples/with-supabase) 的表单、密码确认、Cookie 会话与页面保护流程，后端使用 Better Auth + 当前 PostgreSQL，不需要 Supabase 或 Neon Auth 服务。

1. 配置 `BETTER_AUTH_SECRET`（至少 32 字符的高熵随机值）和 `BETTER_AUTH_URL`（本地 `http://localhost:3000`；部署后填写实际 HTTPS 域名）。密钥示例生成方式见 [.env.example](./.env.example)，不要每次启动重新生成。
2. 使用 Node.js 22.18+ 或 24，执行 `pnpm auth:check` 只读检查认证表；确认后执行 `pnpm auth:migrate` 创建缺失的认证表和索引。当前账号若没有 `public` 建表权限，但有数据库 CREATE 权限，迁移会创建账号同名的自有 schema，利用默认 `"$user", public` 搜索路径隔离认证表，不改变 `public` 权限。也可审阅并手动运行 [db/auth-schema.sql](./db/auth-schema.sql)。迁移命令拒绝修改已有表的列，不会操作目录表或 Neon Auth 表；应用启动不会自动建表。
3. 访问 `/login` 登录，或 `/login?mode=signup` 注册。注册只需填写邮箱、密码与确认密码，密码为 8–128 字符，昵称自动设为“新用户”。注册成功自动登录，默认进入个人中心；从投稿入口进入时会返回投稿表单。

密码由 Better Auth 使用 scrypt 加盐哈希，不存储明文。会话有效期 7 天，使用 HttpOnly、SameSite=Lax Cookie，HTTPS 生产环境自动加 Secure。退出会撤销数据库会话；受保护页面与服务端操作都验证会话。认证 API 使用数据库持久化限流：每 IP 每分钟最多登录 10 次、注册 5 次。部署时请确保反向代理覆盖客户端传入的地址头。

注册默认为普通用户；客户端不能设置 `role`。管理员由数据库维护者审核后将 `ai_directory_users.role` 设置为 `admin`，应用不提供自行提权入口。现有 Neon Auth 用户不会被自动导入或更改。本次仅实现邮箱密码登录注册，未接入邮件发送，因此不展示不可用的邮件验证或找回密码入口。

## 投稿、审核和管理员使用

- 普通用户在个人中心“提交工具”填写工具信息，图片会解码并转为 WebP。投稿仅进入 `ai_directory_tool_submissions`，不会提前公开。
- “提交历史”可分页查看原始内容、私有图片、审核状态和驳回原因。驳回后可重新投稿，旧记录保留。
- 管理员个人中心显示“审核队列”“分类管理”“工具管理”。通过审核时，单条数据库事务新增正式工具并关联原投稿；驳回必须填写原因。并发审核不会重复发布，Slug 冲突完整回滚。
- 分类管理支持新增、名称/短名/说明/图标/排序修改和启停，分类标识创建后固定。停用会隐藏该分类下所有公开工具，并禁止新投稿和通过审核；不删除已有内容。
- 工具管理支持直接收录、修改正文/分类/图片、热门排序、分类内排序和上下架。已收录 Slug 固定；不上传新图时保留旧图，勾选移除时清除，上传新图优先替换。原投稿快照不随正式工具编辑改变。
- 公开媒体接口是 `/api/tool-media/[slug]/[kind]`；私有投稿媒体接口是 `/api/submission-media/[id]/[kind]`。私有资源只允许投稿本人或管理员访问，均不缓存；公开资源也每次检查分类启用和工具发布状态。
- 当前账户的角色由数据库维护者设置，应用没有用户自行提权入口。本次开发没有改变任何实际账号的角色。已获授权的数据库维护者可使用参数化 SQL：`UPDATE "ai-tools".ai_directory_users SET role = 'admin' WHERE id = $1;`，其中用户 ID 应先核实。
- 应用不会在启动时自动建表、迁移或插入工具数据。首页空工具列表是正常状态，管理员收录或通过投稿后才展示。

## 检查与测试

| 命令 | 用途 | 数据影响 |
| --- | --- | --- |
| `pnpm directory:check` | 检查三表必要字段、SSL 和记录数量 | 只读 |
| `pnpm test:auth` | 认证生命周期、哈希、跨站防护、限流 | 内存数据库 |
| `pnpm test:directory` | 内容、分类、排序、URL 与 ID 校验 | 无数据库写入 |
| `pnpm test:directory-db` | 三表业务、权限、并发审核、冲突回滚、快照与分页 | 随机 `dir_test_*` 隔离 schema，测试后删除 |
| `pnpm build` | 生产构建与类型检查 | 仅本地构建产物 |
| `pnpm test:directory-e2e` | 构建后启动随机端口生产服务，测试真实表单和接口 | 随机 `dir_e2e_*` 隔离 schema，测试后删除 |
| `pnpm test:auth-pages` | 检查正在运行的应用页面与未登录跳转 | 只读 HTTP |

数据库集成测试需要当前数据库角色具备创建自有 schema 的权限。测试只在本次随机创建的 schema 中生成临时账号/内容并清理，不修改实际用户、角色或业务记录。端到端测试前先执行 `pnpm build`。`pnpm exec tsc --noEmit` 可单独检查类型。

部署时将 `BETTER_AUTH_URL` 设置为实际 HTTPS 域名，配置 `DATABASE_URL`、`DB_CA_CERT` 和稳定的 `BETTER_AUTH_SECRET`。本地生产预览不加载 Vercel 专用分析脚本；只有 Vercel 环境才启用该集成。

## 排查目录无法加载

- 开发页面提示数据库未配置：检查 `.env.local` 中的 `DATABASE_URL` 是否为空，并重启服务。
- 服务端日志代码 `42P01`：目录表不存在，执行建表脚本。
- 代码 `42703`：已有表缺少应用所需字段，核对数据库结构。
- 代码 `28P01`：检查连接账号与密码。
- 代码 `ECONNREFUSED`、`ENOTFOUND` 或连接超时：检查主机、端口、网络和数据库状态。

连接失败时页面保留不可用提示；不会将失败伪装成空目录或演示数据。服务端只记录错误代码，避免泄露 SQL、连接字符串和用户数据。
