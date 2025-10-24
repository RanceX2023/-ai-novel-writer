#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_ARGS=(-f docker-compose.yml)
DOCKER_ARGS=()
USE_PROD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod|-p)
      USE_PROD=true
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

docker compose "${COMPOSE_ARGS[@]}" build "${DOCKER_ARGS[@]}"
