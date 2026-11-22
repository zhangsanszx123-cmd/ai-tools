# 腾讯云 1Panel 自动部署

提交到 main 后，GitHub Actions 依次运行测试、类型检查和多阶段 Docker 构建；在 Runner 导出压缩镜像，通过 SSH 直接传给服务器，校验压缩包 SHA-256 和 Docker 镜像内容 ID 后导入启动，健康检查通过才记录成功版本。数据库迁移独立执行，不随构建、容器启动或发布运行。

## 当前部署参数

| 项目 | 配置 |
|---|---|
| GitHub 仓库 | zhangsanszx123-cmd/ai-tools |
| 服务器 / 部署用户 | 43.143.85.207 / ubuntu |
| 项目目录 | /opt/projects/ai-tools |
| 当前访问地址 | http://43.143.85.207:8081（80 端口留给 free-video） |
| OpenResty | 1Panel 管理，host 网络 |
| 应用上游 | http://127.0.0.1:13000 |
| PostgreSQL | 现有 18.7 实例，1panel-network 网络 |
| 数据库内部地址 | postgresql:5432 |
| 应用镜像 | ghcr.io/zhangsanszx123-cmd/ai-tools:sha256-内容ID |

应用仅发布 `127.0.0.1:13000:3000`。腾讯云安全组和主机防火墙无需开放 13000 或 3000；网站使用 OpenResty 监听的 8081（腾讯云安全组需放行 TCP 8081；80/443 留给其他网站）。多个网站使用不同的本机端口与独立 Compose 项目。OpenResty 保持 host 网络，不再连接 bridge 网络或使用 `127.0.0.11` 解析应用。

当前没有域名，HTTP IP 模式用于公开页面预览。HTTP 不加密密码和会话；HTTPS 配置完成前不要通过公网输入真实用户或后台凭据。认证功能没有被禁用，也没有人为关闭数据库证书校验。

## 首次初始化

当前服务器已完成部署账户 Docker 权限、目录权限、GitHub SSH Secrets 配置，并已成功运行初始化；2,515 个本地素材文件同步后通过 SHA-256 校验。无需因为后续代码发布重复初始化。

首次准备新环境时，先完成下方的一次性权限配置，然后在本地运行：

```powershell
pnpm deploy:setup --origin http://43.143.85.207:8081
```

有 HTTPS 站点时将 origin 换成实际 HTTPS 地址。省略 `--origin` 会交互询问。脚本读取本地 `.env`、`.env.local`，使用 `~/.ssh/ai-tools-deploy` 严格校验 SSH 主机密钥后连接服务器。可用 `--host`、`--user`、`--port`、`--key` 修改 SSH 参数；数据库与网络配置专用于当前服务器的本机 PostgreSQL。

脚本自动完成：

- 检查 Docker 权限、现有网络、数据库 TLS、本机 13000 端口及上传目录权限。
- 上传 CA 公有证书，验证其能校验现有数据库服务器证书。
- 生成服务器专用 `deploy/runtime.env`，复用现有认证密钥，未配置时首次生成。
- 安装 Compose 与部署脚本，备份已有 Compose 文件。
- 首次同步本地 `storage/media`，逐文件校验 SHA-256；只补齐缺失文件，同名内容不同则保留原文件并停止。

敏感配置通过 SSH 标准输入传输，不放在命令参数或本地临时环境文件中。已有配置不同则保留并停止，相同则保留原认证密钥；检测到成功部署记录时明确跳过初始化。初始化不会启动应用、执行迁移或重启数据库。

仅检查本地参数、不连接服务器：

```powershell
pnpm deploy:setup --origin http://43.143.85.207:8081 --dry-run
```

## 1Panel 一次性反向代理

在创建网站页面选择“反向代理”，按以下内容填写并保存：

| 页面字段 | 当前填写值 |
|---|---|
| 分组 | Default |
| 域名 | 43.143.85.207 |
| 主机名 | 自动生成 |
| 端口 | 8081 |
| 代号 | ai-tools |
| SSL / 启用 HTTPS | 当前均不勾选 |
| 代理地址协议 | http |
| 代理地址输入框 | 127.0.0.1:13000 |
| 应用 | 不选择 |

协议下拉框已选择 http，地址框不重复填写 `http://`。应用首次部署前上游尚未启动，访问时可能返回 502。

网站不在 80/443 时，Host 和 X-Forwarded-Host 必须用 `$http_host`（含端口），不能用 `$host`，否则 Next.js Server Actions 会因来源与 Host 不一致而失败。代理应保留 Host、X-Forwarded-Host、X-Forwarded-Proto，并覆盖客户端传入的转发地址；上传请求体上限至少 3MB，超时至少 60 秒。动态页面和认证接口不启用代理缓存；流式响应关闭缓冲。需要调整配置时，在 1Panel 对应 location 内合并，避免重复声明，再执行配置校验并重载：

```nginx
location / {
    proxy_pass http://127.0.0.1:13000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 60s;
    client_max_body_size 3m;
}
```

## 服务器环境文件与数据库证书

服务器环境变量文件为 `/opt/projects/ai-tools/deploy/runtime.env`，Compose 通过 raw env_file 注入；项目根目录不需要另建 `.env`。文件权限为 600，值不加引号，美元符号保持原样，不支持 `${变量}` 引用。

| 变量 | 用途 |
|---|---|
| DATABASE_URL | 使用内部地址 postgresql:5432 的连接串，保留用户名、密码、数据库及 search_path 等选项 |
| DB_TLS_IDENTITY | 当前为 43.143.85.207，匹配已有服务器证书中的 IP SAN |
| BETTER_AUTH_SECRET | 用户端和管理端共用的稳定密钥，保留至少 32 字符 |
| BETTER_AUTH_URL | 当前为 http://43.143.85.207:8081（必须带端口，否则登录会返回 INVALID_ORIGIN）；HTTPS 就绪后改成实际 HTTPS origin |

密码特殊字符需要在数据库 URL 中编码。运行账号沿用正确的数据库与 schema，不因部署更改表结构或扩大数据库权限。项目实际存储使用 pg 与手写 SQL；虽然依赖 Drizzle ORM，但没有可自动执行的 drizzle-kit 迁移流程。

CA 公有证书位于 `/opt/projects/ai-tools/deploy/secrets/postgres-ca.pem`，只读挂载到容器 `/run/secrets/postgres-ca.pem`。Compose 自动设置 `DB_CA_CERT` 指向这个容器路径。服务器证书只包含公网 IP SAN，因此数据库仍走内部 DNS，但应用和健康检查使用 Node 原生 `checkServerIdentity` 核验显式指定的 IP 身份，同时始终使用 `rejectUnauthorized: true` 校验证书链。无需重新签发服务器证书，也无需上传服务器私钥或 CA 签名私钥。

`ssl_ca_file` 是 PostgreSQL 验证客户端证书的配置，不能据此判断应用所需的服务器签发 CA。不要通过 `sslmode=no-verify` 或关闭证书校验解决部署问题；URL 中相关 SSL 覆盖参数会被连接配置移除。

上传目录 `/opt/projects/ai-tools/storage/media` 持久挂载到 `/app/storage/media`，容器 UID 1000 需要读写权限。发布和回滚均不删除该目录。

## GitHub 一次性设置

工作流的 deploy job 固定使用 `environment: ai_site`，与当前已填写的 Secrets 环境一致。其他环境（例如 production）中的 Environment secrets 不会自动共享；迁移环境名称时必须同步修改工作流。发布会先验证五项 SSH Secrets 是否非空，缺少时仅输出对应名称，不输出密钥内容。
Settings → Environments → ai_site（工作流必须绑定同名环境），部署分支限制为 main；如需完全自动发布，不设置人工审批。Environment secrets（不是 Variables）为：

| Secret | 当前用途 / 值 |
|---|---|
| SSH_HOST | 43.143.85.207 |
| SSH_PORT | 22 |
| SSH_USER | ubuntu |
| SSH_PRIVATE_KEY | 已授权部署公钥对应的完整私钥 |
| SSH_KNOWN_HOSTS | 经服务器控制台核验指纹后的 known_hosts 记录 |

构建 job 使用 `packages: write` 将镜像发布到 GHCR 作为留存副本，并同时加载到 Runner 的本地 Docker。Runner 用 `deploy/image-config-id.py` 计算镜像配置（config）原始字节的 SHA-256，生成 `:sha256-<64位ID>` 标签。该值与镜像存储后端无关：服务器 Docker 29 使用 containerd 镜像存储，`docker image inspect` 的 ID 是 manifest digest，与配置 digest 不同。服务器导入前校验压缩包内配置 digest，导入后再 `docker image save` 复核，然后把本地 ID 记录到 `deploy/releases/image-ids/<配置digest>`，后续状态检查和回滚以该记录比对。随后用 `docker save | gzip -1` 导出镜像，并生成含镜像配置 digest 和压缩包 SHA-256 的元数据。

压缩镜像与元数据通过名为 `ai-tools-production-image` 的 Actions artifact 传给 deploy job，保留 1 天。deploy job 使用 Node 24 执行 `deploy/send-image.mjs`，通过 SSH 直接向服务器传输，日志每 5 秒显示字节数、百分比、平均速度与预计剩余时间。服务器无需登录 GHCR、保存 PAT 或等待慢速 registry 拉取。deploy job 会尝试在 GitHub 临时 Runner 上启用可用的 TCP BBR，改善高延迟链路的发送表现；不修改生产服务器网络，实际速度以传输日志为准。

服务器仅接收、校验、`docker load` 和运行镜像，不安装 Node 或构建应用。压缩包校验失败、镜像内容 ID 不符或导入失败时不替换当前容器。每次传输有独立 ID 和成功记录；SSH 响应丢失后可核对状态，避免重复导入。应用启动始终使用 `--pull never`，本地标签必须与实际镜像 ID 匹配。

数据库密码、认证密钥、实际 runtime.env、CA 文件与 SSH 私钥均不提交到仓库，不作为 Docker build args。部署 job 最长允许 60 分钟，镜像通过现有 SSH 连接传输；SSH 防火墙需允许所用 Runner 连通。不要在流水线里临时 ssh-keyscan 并直接信任结果。

## 后续发布与首次验证

以后完成本地代码提交后，只需：

```bash
git push origin main
```

也可在 Actions 的 Test, build and deploy 工作流中选择 main 手动运行。测试或构建失败时不进入发布；发布使用镜像 digest，不依赖 latest 标签。 SCP/SSH 传输最多尝试 4 次，间隔 5、10、20 秒，并配置连接超时和保活。远端部署命令只有 SSH 连接错误（255）才重试，应用启动、健康检查或回滚失败会立即报告。

首次部署时查看测试、构建、镜像发布和 deploy 各步骤。成功后在服务器执行：

```bash
cd /opt/projects/ai-tools
export APP_IMAGE=$(cat deploy/current-image)
docker compose ps
docker compose exec app node healthcheck.cjs
docker compose port app 3000
curl -f http://127.0.0.1:13000/login
```

端口输出应为 `127.0.0.1:13000`。浏览器访问 `http://43.143.85.207:8081`，检查首页、分类、详情与图片；当前 HTTP 预览阶段不验证真实账号登录或后台密码。外网访问服务器 13000 和 3000 应失败。

健康检查执行内部 `/login` HTTP 请求和经 CA、证书身份校验的 `SELECT 1`，不修改数据库；这不代表业务表结构全部正确。排查时可在管理员终端运行 `docker compose logs --tail=100 app`，不要公开含业务信息的日志。

CI 运行无生产数据库依赖的单元测试、真实临时 TLS 测试、类型检查和 shell 语法检查。`auth-pages`、`directory-db`、`directory-e2e` 需要运行中的应用或数据库，应在独立测试环境执行，不向发布 CI 提供生产数据库凭据。

## 失败保护与回滚

服务器先接收并校验压缩包、导入和核对镜像内容 ID，再更新应用，最多等待 180 秒就绪；失败时自动恢复记录的上一成功镜像，Actions 仍报告失败。首次部署没有上一版本，失败时停止新应用并标红。部署脚本使用 flock，Actions 也串行执行；不要同时在 1Panel 重建同一应用。

单实例更新存在短暂停机。Docker 的 unhealthy 状态本身不会自动重启容器；主机重启、SSH 中断或磁盘故障仍需管理员检查。

手工回滚使用保留的本地镜像，不需要镜像仓库登录：

```bash
cd /opt/projects/ai-tools
bash deploy/deploy.sh --local "$(cat deploy/previous-image)"
```

可传入 `deploy/releases/history.log` 中已知健康的 digest。不要清理最近可用的两个镜像。回滚只恢复应用镜像，不恢复数据库、上传文件或 Compose；修改编排配置时保存旧配置，必要时恢复对应 Git 提交的 Compose 后再执行。数据库结构需要同时兼容前后版本。

## 后续切换域名与 HTTPS

1. 将域名 DNS 指向服务器，在 1Panel 绑定域名并配置受信任的 HTTPS 证书及 HTTPS 跳转。
2. 编辑服务器 `deploy/runtime.env`，仅将 BETTER_AUTH_URL 改为实际 HTTPS origin，保留数据库配置和原 BETTER_AUTH_SECRET。
3. 在服务器重建应用使运行变量生效：

```bash
cd /opt/projects/ai-tools
APP_IMAGE=$(cat deploy/current-image) docker compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 180 app
```

HTTPS 就绪后，再验证用户登录、后台登录、Secure/HttpOnly Cookie、测试账号上传以及重建后的文件持久性。网站 HTTPS 与数据库 TLS 为独立配置，不共用数据库服务器私钥。

## 独立迁移与备份

迁移不放进 Docker CMD、健康检查或 Actions。需要结构变更时先备份，在单独受控的源码检出和 Node 24/pnpm 工具环境中审核 SQL，再运行只读检查 `pnpm auth:check`、`pnpm admin:check`；经人工确认才执行 `pnpm auth:migrate`、`pnpm admin:migrate`。其余 db/*.sql 逐份审核，禁止批量套用、删除或重建现有数据库。运行镜像不包含迁移 SQL 与工具。

定期备份 PostgreSQL、storage/media、runtime.env、CA 和成功版本记录。环境文件备份应加密并限制访问。

## 新服务器权限准备参考

Docker Compose 需支持 raw env_file（2.30+），服务器为当前镜像目标 linux/amd64。首次创建可信部署账户并授予 Docker 权限后，重新登录使 docker 组生效；该组具有接近 root 的权限。按实际用户名替换 ubuntu：

```bash
sudo install -d -o ubuntu -g ubuntu -m 750 /opt/projects/ai-tools
sudo install -d -o ubuntu -g ubuntu -m 700 /opt/projects/ai-tools/deploy /opt/projects/ai-tools/deploy/secrets /opt/projects/ai-tools/deploy/releases
sudo install -d -m 755 /opt/projects/ai-tools/storage
sudo install -d -o 1000 -g 1000 -m 750 /opt/projects/ai-tools/storage/media
```

保留现有 PostgreSQL 和 OpenResty，确认 PostgreSQL 位于 1panel-network 且已开启 TLS，再运行初始化。外部数据库或 ARM 主机需调整对应配置。

参考：[Next standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)、[GitHub GHCR 发布](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)、[Docker host 网络](https://docs.docker.com/engine/network/drivers/host/)、[回环端口映射](https://docs.docker.com/engine/network/port-publishing/)、[PostgreSQL 18 TLS](https://www.postgresql.org/docs/18/ssl-tcp.html)、[Better Auth 安全配置](https://better-auth.com/docs/reference/security)。

镜像交付参考：[Docker 多 exporter](https://docs.docker.com/build/exporters/#multiple-exporters)、[docker save 压缩导出](https://docs.docker.com/reference/cli/docker/image/save/)、[docker load 导入](https://docs.docker.com/reference/cli/docker/image/load/)。旧的 registry digest 引用仍可用于本地缓存回滚，新版自动部署不调用 legacy remote-release.sh 的 registry 拉取路径。

传输优化参考：[Linux TCP BBR 快速说明](https://github.com/google/bbr/blob/master/Documentation/bbr-quick-start.md)。
