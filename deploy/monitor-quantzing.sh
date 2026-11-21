#!/usr/bin/env bash
# =============================================================================
# QuantZing Uptime & Resource Watchdog Monitor
# - Probes http://127.0.0.1:3008/health (verifying "ok":true)
# - Auto-restarts quantzing systemd service on failure, waits 3s, re-checks
# - Audits root disk usage (>85%) and available memory (<400 MB)
# - Optionally posts JSON alert to $ALERT_WEBHOOK_URL when an incident occurs
# =============================================================================

set -euo pipefail

HEALTH_URL="${QUANTZING_HEALTH_URL:-http://127.0.0.1:3008/health}"
SERVICE_NAME="${QUANTZING_SERVICE_NAME:-quantzing}"
LOG_FILE="${QUANTZING_MONITOR_LOG:-/var/log/quantzing-monitor.log}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
MIN_AVAIL_RAM_MB="${MIN_AVAIL_RAM_MB:-400}"
CURL_TIMEOUT="${QUANTZING_HEALTH_TIMEOUT:-8}"
RESTART_WAIT_SEC="${QUANTZING_RESTART_WAIT_SEC:-3}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
HOST_NAME="$(hostname -f 2>/dev/null || hostname)"

mkdir -p "$(dirname "${LOG_FILE}")"
touch "${LOG_FILE}"

log() {
  local level="$1"
  shift
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local line="[${ts}] [quantzing-monitor] [${level}] $*"
  printf '%s\n' "${line}" | tee -a "${LOG_FILE}"
}

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "${s}"
}

LAST_HEALTH_ERROR=""
check_health() {
  local body
  if ! body="$(curl -fsS --max-time "${CURL_TIMEOUT}" "${HEALTH_URL}" 2>&1)"; then
    LAST_HEALTH_ERROR="${body}"
    return 1
  fi
  if printf '%s' "${body}" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
    LAST_HEALTH_ERROR=""
    return 0
  fi
  LAST_HEALTH_ERROR="unexpected health response: ${body:0:200}"
  return 1
}

DISK_PCT="$(df -P / | awk 'NR==2 {for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+%$/) {gsub(/%/, "", $i); print $i; exit}}')"
AVAIL_RAM_MB="$(free -m | awk '/^Mem:/ {print ($7 != "" ? $7 : $4)}')"
TOTAL_RAM_MB="$(free -m | awk '/^Mem:/ {print $2}')"

DISK_PCT="${DISK_PCT:-0}"
AVAIL_RAM_MB="${AVAIL_RAM_MB:-0}"
TOTAL_RAM_MB="${TOTAL_RAM_MB:-0}"

INCIDENT_OCCURRED=0
HEALTH_STATUS="healthy"
INCIDENT_SEVERITY="INFO"
INCIDENT_MESSAGE=""
EXIT_CODE=0

if check_health; then
  HEALTH_STATUS="healthy"
else
  INCIDENT_OCCURRED=1
  HEALTH_STATUS="unhealthy"
  INITIAL_ERR="${LAST_HEALTH_ERROR}"
  log "INCIDENT" "Health check failed on ${HEALTH_URL} (${INITIAL_ERR}); restarting systemd service '${SERVICE_NAME}'"

  if systemctl restart "${SERVICE_NAME}" 2>&1; then
    sleep "${RESTART_WAIT_SEC}"
    if check_health; then
      HEALTH_STATUS="recovered"
      INCIDENT_SEVERITY="WARNING"
      INCIDENT_MESSAGE="QuantZing failed health check (${INITIAL_ERR}) and recovered after systemctl restart ${SERVICE_NAME}."
      log "RECOVERED" "Service '${SERVICE_NAME}' recovered after restart and passed ${HEALTH_URL}"
    else
      HEALTH_STATUS="failed"
      INCIDENT_SEVERITY="CRITICAL"
      INCIDENT_MESSAGE="QuantZing failed health check (${INITIAL_ERR}) and remained unhealthy after systemctl restart ${SERVICE_NAME} (${LAST_HEALTH_ERROR})."
      log "ERROR" "Service '${SERVICE_NAME}' failed recovery check after restart (${LAST_HEALTH_ERROR})"
      EXIT_CODE=1
    fi
  else
    HEALTH_STATUS="restart_failed"
    INCIDENT_SEVERITY="CRITICAL"
    INCIDENT_MESSAGE="QuantZing failed health check (${INITIAL_ERR}) and systemctl restart ${SERVICE_NAME} exited non-zero."
    log "ERROR" "systemctl restart '${SERVICE_NAME}' failed during incident recovery"
    EXIT_CODE=1
  fi
fi

# System resource health checks (root disk >85% or available RAM <400 MB)
RESOURCE_WARNINGS=()
if [[ "${DISK_PCT}" =~ ^[0-9]+$ ]] && (( DISK_PCT > DISK_WARN_PCT )); then
  log "WARN" "Root disk usage high: ${DISK_PCT}% used (threshold >${DISK_WARN_PCT}%)"
  RESOURCE_WARNINGS+=("disk=${DISK_PCT}%>${DISK_WARN_PCT}%")
fi

if [[ "${AVAIL_RAM_MB}" =~ ^[0-9]+$ ]] && (( AVAIL_RAM_MB < MIN_AVAIL_RAM_MB )); then
  log "WARN" "Available RAM low: ${AVAIL_RAM_MB}MB available of ${TOTAL_RAM_MB}MB (threshold <${MIN_AVAIL_RAM_MB}MB)"
  RESOURCE_WARNINGS+=("avail_ram=${AVAIL_RAM_MB}MB<${MIN_AVAIL_RAM_MB}MB")
fi

if (( INCIDENT_OCCURRED == 0 )); then
  log "OK" "health=ok disk=${DISK_PCT}% avail_ram=${AVAIL_RAM_MB}MB/${TOTAL_RAM_MB}MB"
fi

# Optional webhook alert on incident
if [[ -n "${ALERT_WEBHOOK_URL}" && "${INCIDENT_OCCURRED}" -eq 1 ]]; then
  NOW_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  WARN_SUMMARY="none"
  if (( ${#RESOURCE_WARNINGS[@]} > 0 )); then
    WARN_SUMMARY="$(IFS=','; printf '%s' "${RESOURCE_WARNINGS[*]}")"
  fi
  ALERT_TEXT="[QuantZing Watchdog][${INCIDENT_SEVERITY}] host=${HOST_NAME} status=${HEALTH_STATUS}: ${INCIDENT_MESSAGE} (disk=${DISK_PCT}%, avail_ram=${AVAIL_RAM_MB}MB, warnings=${WARN_SUMMARY})"
  PAYLOAD="$(printf '{"service":"%s","host":"%s","status":"%s","severity":"%s","message":"%s","text":"%s","disk_pct":%s,"avail_ram_mb":%s,"warnings":"%s","timestamp":"%s"}' \
    "$(json_escape "${SERVICE_NAME}")" \
    "$(json_escape "${HOST_NAME}")" \
    "$(json_escape "${HEALTH_STATUS}")" \
    "$(json_escape "${INCIDENT_SEVERITY}")" \
    "$(json_escape "${INCIDENT_MESSAGE}")" \
    "$(json_escape "${ALERT_TEXT}")" \
    "${DISK_PCT}" \
    "${AVAIL_RAM_MB}" \
    "$(json_escape "${WARN_SUMMARY}")" \
    "${NOW_ISO}")"

  if curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' -d "${PAYLOAD}" "${ALERT_WEBHOOK_URL}" >/dev/null 2>&1; then
    log "INFO" "Posted incident alert to ALERT_WEBHOOK_URL"
  else
    log "WARN" "Failed to post incident alert to ALERT_WEBHOOK_URL"
  fi
fi

exit "${EXIT_CODE}"
