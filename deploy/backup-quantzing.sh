#!/usr/bin/env bash
# =============================================================================
# QuantZing Sovereign Data Backup Script (Atomic db.json + blobs/)
# - Stages an atomic copy of db.json before archiving to prevent torn reads
# - Verifies gzip & tar archive integrity before committing final .tar.gz
# - Prunes local backups older than RETENTION_DAYS (default: 14)
# - Optionally uploads archive to OCI Object Storage when OCI_BACKUP_BUCKET is set
# =============================================================================

set -euo pipefail
umask 077

DATA_DIR="${QUANTZING_DATA_DIR:-/var/lib/quantzing}"
BACKUP_DIR="${QUANTZING_BACKUP_DIR:-/var/backups/quantzing}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
LOG_FILE="${QUANTZING_BACKUP_LOG:-/var/log/quantzing-backup.log}"
OCI_BACKUP_BUCKET="${OCI_BACKUP_BUCKET:-}"

mkdir -p "$(dirname "${LOG_FILE}")" "${BACKUP_DIR}"
touch "${LOG_FILE}"

log() {
  local level="$1"
  shift
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local line="[${ts}] [quantzing-backup] [${level}] $*"
  printf '%s\n' "${line}" | tee -a "${LOG_FILE}"
}

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
  log "ERROR" "Invalid RETENTION_DAYS='${RETENTION_DAYS}' (must be a non-negative integer)"
  exit 1
fi

SOURCE_DIR="${DATA_DIR}"
if [[ ! -f "${SOURCE_DIR}/db.json" && -f "${SOURCE_DIR}/.quantzing-data/db.json" ]]; then
  SOURCE_DIR="${SOURCE_DIR}/.quantzing-data"
fi

if [[ ! -f "${SOURCE_DIR}/db.json" ]]; then
  log "ERROR" "Source db.json not found in '${DATA_DIR}' (checked '${SOURCE_DIR}/db.json')"
  exit 1
fi

START_EPOCH="$(date +%s)"
TIMESTAMP="$(date -u '+%Y%m%d-%H%M%S')"
ARCHIVE_NAME="quantzing-backup-${TIMESTAMP}.tar.gz"
ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}"
TMP_ARCHIVE="${BACKUP_DIR}/.${ARCHIVE_NAME}.tmp.$$"
STAGE_DIR="$(mktemp -d "${BACKUP_DIR}/.stage-${TIMESTAMP}-XXXXXX")"

cleanup() {
  if [[ -n "${STAGE_DIR:-}" && -d "${STAGE_DIR}" ]]; then
    rm -rf "${STAGE_DIR}"
  fi
  if [[ -n "${TMP_ARCHIVE:-}" && -f "${TMP_ARCHIVE}" ]]; then
    rm -f "${TMP_ARCHIVE}"
  fi
}
trap cleanup EXIT

# Copy db.json to staging file first so live writes cannot tear the archive
cp -p "${SOURCE_DIR}/db.json" "${STAGE_DIR}/db.json"
if [[ ! -s "${STAGE_DIR}/db.json" ]]; then
  log "ERROR" "Staged db.json is empty; aborting backup"
  exit 1
fi

BLOB_COUNT=0
TAR_RC=0
if [[ -d "${SOURCE_DIR}/blobs" ]]; then
  BLOB_COUNT="$(find "${SOURCE_DIR}/blobs" -type f | wc -l | tr -d ' ')"
  tar -czf "${TMP_ARCHIVE}" -C "${STAGE_DIR}" db.json -C "${SOURCE_DIR}" blobs || TAR_RC=$?
else
  mkdir -p "${STAGE_DIR}/blobs"
  tar -czf "${TMP_ARCHIVE}" -C "${STAGE_DIR}" db.json blobs || TAR_RC=$?
fi

# GNU tar returns 1 if a blob was concurrently added during archive; >=2 is fatal
if [[ "${TAR_RC}" -ne 0 && "${TAR_RC}" -ne 1 ]]; then
  log "ERROR" "tar failed with exit code ${TAR_RC} while creating ${TMP_ARCHIVE}"
  exit "${TAR_RC}"
fi
if [[ "${TAR_RC}" -eq 1 ]]; then
  log "WARN" "tar reported concurrent change in blobs/ during read; verifying archive integrity"
fi

# Verify gzip and tar stream integrity before publishing final archive
if ! gzip -t "${TMP_ARCHIVE}"; then
  log "ERROR" "gzip -t integrity check failed for ${TMP_ARCHIVE}"
  exit 1
fi
if ! tar -tzf "${TMP_ARCHIVE}" >/dev/null 2>&1; then
  log "ERROR" "tar -tzf structure check failed for ${TMP_ARCHIVE}"
  exit 1
fi

mv -f "${TMP_ARCHIVE}" "${ARCHIVE}"
chmod 600 "${ARCHIVE}"
TMP_ARCHIVE=""

# Prune local backups older than RETENTION_DAYS
PRUNED_COUNT=0
while IFS= read -r -d '' old_file; do
  rm -f "${old_file}"
  PRUNED_COUNT=$((PRUNED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'quantzing-backup-*.tar.gz' -mtime +"${RETENTION_DAYS}" -print0)

LOCAL_COUNT="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'quantzing-backup-*.tar.gz' | wc -l | tr -d ' ')"

# Optional off-site upload to Oracle Cloud Object Storage
OCI_STATUS="skipped(no-bucket)"
if [[ -n "${OCI_BACKUP_BUCKET}" ]]; then
  if command -v oci >/dev/null 2>&1; then
    if oci os object put \
      --bucket-name "${OCI_BACKUP_BUCKET}" \
      --file "${ARCHIVE}" \
      --name "backups/$(basename "${ARCHIVE}")" \
      --force >/dev/null 2>&1; then
      OCI_STATUS="uploaded(oci://${OCI_BACKUP_BUCKET}/backups/$(basename "${ARCHIVE}"))"
    else
      log "ERROR" "OCI Object Storage upload failed for ${ARCHIVE} -> bucket=${OCI_BACKUP_BUCKET}"
      exit 1
    fi
  else
    OCI_STATUS="skipped(oci-cli-missing)"
    log "WARN" "OCI_BACKUP_BUCKET='${OCI_BACKUP_BUCKET}' is configured but 'oci' CLI is not installed; local backup retained at ${ARCHIVE}"
  fi
fi

ARCHIVE_BYTES="$(wc -c < "${ARCHIVE}" | tr -d ' ')"
ARCHIVE_HUMAN="$(du -h "${ARCHIVE}" | awk '{print $1}')"
ELAPSED_SEC=$(( $(date +%s) - START_EPOCH ))

log "INFO" "Backup OK file=${ARCHIVE} size=${ARCHIVE_HUMAN} (${ARCHIVE_BYTES}B) source=${SOURCE_DIR} blobs=${BLOB_COUNT} gzip_verified=ok pruned=${PRUNED_COUNT} kept=${LOCAL_COUNT} retention_days=${RETENTION_DAYS} oci=${OCI_STATUS} duration=${ELAPSED_SEC}s"
