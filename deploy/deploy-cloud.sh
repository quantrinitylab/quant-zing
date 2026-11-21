#!/usr/bin/env bash
# =============================================================================
# QuantZing (quantzing.com) — Production Ubuntu/Debian VPS Deployment Script
# Supports Docker Compose mode (--docker) or Native Systemd mode (--systemd)
# =============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/quant-os/quant-zing}"
DATA_DIR="${QUANTZING_PDS_DATA_DIR:-/var/lib/quantzing/.quantzing-data}"
DOMAIN="${QUANTZING_DOMAIN:-quantzing.com}"
MODE="${1:---docker}"

echo "========================================================================"
echo " Deploying QuantZing (${DOMAIN})"
echo " App Directory : ${APP_DIR}"
echo " PDS Data Dir  : ${DATA_DIR}"
echo " Mode          : ${MODE}"
echo "========================================================================"

mkdir -p "${DATA_DIR}/blobs"

if [[ "${MODE}" == "--docker" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[QuantZing Deploy] Installing Docker Engine & Compose plugin..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://get.docker.com | sh
  fi

  cd "${APP_DIR}"
  echo "[QuantZing Deploy] Building and starting production containers..."
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

  echo "[QuantZing Deploy] Waiting for QuantZing health check on :3008..."
  for i in {1..20}; do
    if curl -fsS http://127.0.0.1:3008/health >/dev/null 2>&1; then
      echo "[QuantZing Deploy] QuantZing is LIVE and healthy:"
      curl -fsS http://127.0.0.1:3008/health
      echo ""
      exit 0
    fi
    sleep 2
  done

  echo "[QuantZing Deploy] ERROR: Health check did not pass within 40 seconds."
  docker compose -f docker-compose.prod.yml logs --tail=50
  exit 1
fi

if [[ "${MODE}" == "--systemd" ]]; then
  if ! id -u quantzing >/dev/null 2>&1; then
    useradd --system --create-home --home-dir /var/lib/quantzing --shell /usr/sbin/nologin quantzing
  fi

  chown -R quantzing:quantzing "${DATA_DIR}"

  cd "${APP_DIR}"
  corepack enable
  corepack prepare pnpm@10.28.1 --activate
  pnpm install --frozen-lockfile
  pnpm build-web

  cp "${APP_DIR}/deploy/systemd/quantzing.service" /etc/systemd/system/quantzing.service
  systemctl daemon-reload
  systemctl enable quantzing.service
  systemctl restart quantzing.service

  sleep 2
  systemctl status quantzing.service --no-pager
  curl -fsS http://127.0.0.1:3008/health
  echo ""
  exit 0
fi

echo "Usage: $0 [--docker | --systemd]"
exit 1
