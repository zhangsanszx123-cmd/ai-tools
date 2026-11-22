#!/usr/bin/env bash
# Read the token from stdin; discard temporary Docker credentials on exit.
set -Eeuo pipefail
umask 077
[[ $# -eq 2 ]] || { echo 'Usage: remote-release.sh IMAGE REGISTRY_USER' >&2; exit 2; }
image=$1
registry_user=$2
[[ "$image" =~ ^ghcr\.io/zhangsanszx123-cmd/ai-tools@sha256:[a-f0-9]{64}$ ]] || { echo 'Unexpected image reference' >&2; exit 2; }
[[ "$registry_user" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]*(\[bot\])?$ ]] || { echo 'Unexpected registry user' >&2; exit 2; }
registry_token=''
if ! IFS= read -r registry_token && [[ -z "$registry_token" ]]; then
  echo 'GitHub registry token is required on stdin' >&2
  exit 2
fi
[[ -n "$registry_token" ]] || { echo 'GitHub registry token is empty' >&2; exit 2; }
registry_config=$(mktemp -d /tmp/ai-tools-registry.XXXXXX)
cleanup() {
  rm -rf -- "$registry_config"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
printf '%s' "$registry_token" | docker --config "$registry_config" login ghcr.io -u "$registry_user" --password-stdin
unset registry_token
docker --config "$registry_config" pull "$image"
cd /opt/projects/ai-tools
bash deploy/deploy.sh --local "$image"
