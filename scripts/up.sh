#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ensure_env_file() {
  local target="$1"
  local example="$2"

  if [[ ! -f "$target" ]]; then
    echo "缺少环境变量文件：${target}" >&2
    if [[ -f "$example" ]]; then
      echo "请先执行：cp ${example} ${target}" >&2
    fi
    exit 1
  fi
}

ensure_env_file "$ROOT_DIR/client/.env" "$ROOT_DIR/client/.env.example"
ensure_env_file "$ROOT_DIR/server/.env" "$ROOT_DIR/server/.env.example"

COMPOSE_ARGS=(-f docker-compose.yml)
DOCKER_ARGS=()
USE_PROD=false
FG_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod|-p)
      USE_PROD=true
      ;;
    --fg)
      FG_MODE=true
      ;;
    --)
      shift
      DOCKER_ARGS+=("$@")
      break
      ;;
    *)
      DOCKER_ARGS+=("$1")
      ;;
  esac
  shift
done

if [[ "$USE_PROD" == true ]]; then
  COMPOSE_ARGS+=(-f docker-compose.prod.yml)
fi

if [[ "$FG_MODE" == true ]]; then
  docker compose "${COMPOSE_ARGS[@]}" up "${DOCKER_ARGS[@]}"
else
  docker compose "${COMPOSE_ARGS[@]}" up -d "${DOCKER_ARGS[@]}"
  echo "服务已在后台启动，可使用 docker compose ps 查看状态。"
fi
