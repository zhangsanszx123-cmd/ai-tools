#!/usr/bin/env bash
# Invoked by setup-production.mjs over SSH stdin; credentials never appear in argv.
set -Eeuo pipefail
umask 077
cd /opt/projects/ai-tools
test -w . || { echo '项目目录不可写，请检查部署账户权限。' >&2; exit 1; }
mkdir -p deploy/secrets deploy/releases
chmod 700 deploy deploy/secrets deploy/releases
exec 9>deploy/.deploy.lock
flock -n 9 || { echo '已有部署正在进行，请稍后重试。' >&2; exit 1; }
if [[ -s deploy/current-image ]]; then
  echo '已有成功部署，保留现有生产配置；无需重复初始化。'
  exit 20
fi
docker info >/dev/null
docker network inspect 1panel-network >/dev/null
command -v openssl >/dev/null
command -v ss >/dev/null
if [[ -n "$(ss -ltnH 'sport = :13000')" ]]; then
  echo '本机 13000 端口已被占用，尚未安装配置。' >&2
  exit 1
fi
mkdir -p storage/media
if [[ "$(stat -c %u storage/media)" != 1000 ]]; then
  echo '上传目录需要归容器 UID 1000 所有，请修正 storage/media 权限后重试。' >&2
  exit 1
fi
stage=$(mktemp -d "$PWD/deploy/.setup.XXXXXX")
cleanup() {
  rm -f -- "$stage/runtime.env" "$stage/postgres-ca.pem" "$stage/server.crt" "$stage/docker-compose.yml" "$stage/deploy.sh" "$stage/remote-release.sh" "$stage/seed-media.sh"
  rmdir -- "$stage"
}
trap cleanup EXIT
printf '%s' "$RUNTIME_B64" | base64 -d > "$stage/runtime.env"
printf '%s' "$CA_B64" | base64 -d > "$stage/postgres-ca.pem"
printf '%s' "$COMPOSE_B64" | base64 -d > "$stage/docker-compose.yml"
printf '%s' "$DEPLOY_B64" | base64 -d > "$stage/deploy.sh"
printf '%s' "$RELEASE_B64" | base64 -d > "$stage/remote-release.sh"
printf '%s' "$MEDIA_B64" | base64 -d > "$stage/seed-media.sh"
identity=$(printf '%s' "$IDENTITY_B64" | base64 -d)
[[ "$IDENTITY_KIND" == ip || "$IDENTITY_KIND" == hostname ]]
[[ -n "$identity" ]]
database=1Panel-postgresql-9meV
psql_setting() {
  docker exec "$database" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -Atc "$1"' sh "$1"
}
[[ "$(psql_setting 'SHOW ssl;')" == on ]] || { echo '数据库未启用 TLS。' >&2; exit 1; }
[[ "$(psql_setting 'SHOW port;')" == 5432 ]] || { echo '数据库内部端口不是 5432，需要调整初始化配置。' >&2; exit 1; }
cert_path=$(psql_setting 'SHOW ssl_cert_file;')
if [[ "$cert_path" != /* ]]; then cert_path="$(psql_setting 'SHOW data_directory;')/$cert_path"; fi
docker exec "$database" cat -- "$cert_path" > "$stage/server.crt"
openssl verify -purpose sslserver -CAfile "$stage/postgres-ca.pem" "-verify_$IDENTITY_KIND" "$identity" "$stage/server.crt" >/dev/null
if [[ -s deploy/secrets/postgres-ca.pem ]]; then
  old_ca=$(openssl x509 -in deploy/secrets/postgres-ca.pem -noout -fingerprint -sha256)
  new_ca=$(openssl x509 -in "$stage/postgres-ca.pem" -noout -fingerprint -sha256)
  [[ "$old_ca" == "$new_ca" ]] || { echo '已有 CA 与本地 CA 不同，保留原文件并停止。' >&2; exit 1; }
fi
if [[ -s deploy/runtime.env ]]; then
  for key in DATABASE_URL DB_TLS_IDENTITY BETTER_AUTH_URL; do
    old_value=$(grep -m1 "^${key}=" deploy/runtime.env || true)
    new_value=$(grep -m1 "^${key}=" "$stage/runtime.env" || true)
    [[ -n "$old_value" && "$old_value" == "$new_value" ]] || { echo '已有运行配置与本次目标不同，保留原文件并停止。' >&2; exit 1; }
  done
  echo '保留已有运行配置和认证密钥。'
else
  chmod 600 "$stage/runtime.env"
  mv -- "$stage/runtime.env" deploy/runtime.env
fi
chmod 600 deploy/runtime.env
if [[ ! -s deploy/secrets/postgres-ca.pem ]]; then
  chmod 644 "$stage/postgres-ca.pem"
  mv -- "$stage/postgres-ca.pem" deploy/secrets/postgres-ca.pem
fi
chmod 644 deploy/secrets/postgres-ca.pem
APP_IMAGE=ghcr.io/zhangsanszx123-cmd/ai-tools:setup-check docker compose --project-directory "$PWD" -f "$stage/docker-compose.yml" config --quiet
if [[ -f docker-compose.yml ]]; then cp -- docker-compose.yml "deploy/releases/compose-before-setup-$(date -u +%Y%m%dT%H%M%SZ).yml"; fi
mv -- "$stage/docker-compose.yml" docker-compose.yml
mv -- "$stage/deploy.sh" deploy/deploy.sh
mv -- "$stage/remote-release.sh" deploy/remote-release.sh
mv -- "$stage/seed-media.sh" deploy/seed-media.sh
chmod 600 docker-compose.yml deploy/deploy.sh deploy/remote-release.sh deploy/seed-media.sh
echo '服务器目录、CA、运行变量和 Compose 已准备完成。未启动应用，未修改数据库。'
