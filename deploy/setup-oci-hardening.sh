#!/usr/bin/env bash
# =============================================================================
# QuantZing OCI Production Hardening Installer (Idempotent)
# Installs:
#   - /var/backups/quantzing and /var/log/quantzing-{backup,monitor}.log
#   - Executable permissions on backup/monitor scripts
#   - systemd backup & monitor service + timer units
#   - /etc/logrotate.d/quantzing log rotation policy
# Runs an immediate verification backup + monitor check and lists active timers.
# =============================================================================

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[quantzing-hardening] ERROR: Must be run as root (e.g. sudo $0)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-/opt/quantzing}"
DEPLOY_DIR="${APP_DIR}/deploy"
BACKUP_DIR="${QUANTZING_BACKUP_DIR:-/var/backups/quantzing}"
BACKUP_LOG="${QUANTZING_BACKUP_LOG:-/var/log/quantzing-backup.log}"
MONITOR_LOG="${QUANTZING_MONITOR_LOG:-/var/log/quantzing-monitor.log}"

echo "========================================================================"
echo " QuantZing OCI Phase 1 Production Hardening Setup"
echo " App Directory : ${APP_DIR}"
echo " Backup Dir    : ${BACKUP_DIR}"
echo "========================================================================"

# If invoked from a checkout outside /opt/quantzing/deploy, sync hardening assets into /opt/quantzing/deploy
if [[ "${SCRIPT_DIR}" != "${DEPLOY_DIR}" ]]; then
  mkdir -p "${DEPLOY_DIR}/systemd"
  cp -f "${SCRIPT_DIR}/backup-quantzing.sh" "${DEPLOY_DIR}/backup-quantzing.sh"
  cp -f "${SCRIPT_DIR}/monitor-quantzing.sh" "${DEPLOY_DIR}/monitor-quantzing.sh"
  cp -f "${SCRIPT_DIR}/logrotate-quantzing" "${DEPLOY_DIR}/logrotate-quantzing"
  cp -f "${SCRIPT_DIR}/setup-oci-hardening.sh" "${DEPLOY_DIR}/setup-oci-hardening.sh"
  for unit in quantzing-backup.service quantzing-backup.timer quantzing-monitor.service quantzing-monitor.timer; do
    cp -f "${SCRIPT_DIR}/systemd/${unit}" "${DEPLOY_DIR}/systemd/${unit}"
  done
fi

# 1. Create backup directory & log files idempotently
mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

mkdir -p "$(dirname "${BACKUP_LOG}")" "$(dirname "${MONITOR_LOG}")"
touch "${BACKUP_LOG}" "${MONITOR_LOG}"
chmod 640 "${BACKUP_LOG}" "${MONITOR_LOG}"

# 2. Ensure hardening scripts are executable
chmod +x \
  "${DEPLOY_DIR}/backup-quantzing.sh" \
  "${DEPLOY_DIR}/monitor-quantzing.sh" \
  "${DEPLOY_DIR}/setup-oci-hardening.sh"

# 3. Install the 4 systemd units into /etc/systemd/system/
for unit in \
  quantzing-backup.service \
  quantzing-backup.timer \
  quantzing-monitor.service \
  quantzing-monitor.timer; do
  install -m 0644 "${DEPLOY_DIR}/systemd/${unit}" "/etc/systemd/system/${unit}"
done

# 4. Install logrotate policy into /etc/logrotate.d/quantzing
install -m 0644 "${DEPLOY_DIR}/logrotate-quantzing" /etc/logrotate.d/quantzing
if command -v logrotate >/dev/null 2>&1; then
  logrotate -d /etc/logrotate.d/quantzing >/dev/null 2>&1 || true
fi

# 5. Reload systemd and enable + start timers
systemctl daemon-reload
systemctl enable --now quantzing-backup.timer
systemctl enable --now quantzing-monitor.timer

# 6. Load optional /etc/quantzing/hardening.env before immediate verification runs
if [[ -f /etc/quantzing/hardening.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/quantzing/hardening.env
  set +a
fi

echo "[quantzing-hardening] Running immediate verification backup..."
"${DEPLOY_DIR}/backup-quantzing.sh"

echo "[quantzing-hardening] Running immediate monitor health check..."
"${DEPLOY_DIR}/monitor-quantzing.sh"

echo "[quantzing-hardening] Active QuantZing systemd timers:"
systemctl list-timers --all --no-pager 'quantzing-*'

echo "[quantzing-hardening] Phase 1 hardening setup complete."
