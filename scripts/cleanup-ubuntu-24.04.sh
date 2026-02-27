#!/usr/bin/env bash
set -Eeuo pipefail

# Cleanup script for broken installs on Ubuntu 24.04.
# Removes service/nginx/db objects so you can reinstall cleanly.

SERVICE_NAME="reebok-house-manager"
APP_PORT="3000"
TEMP_PORT="3001"
DB_NAME="reebok_house"
DB_USER="reebok_app"
REMOVE_APP_DIR="false"
KEEP_DB="false"
YES="false"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR_DEFAULT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR_DEFAULT}"

print_help() {
  cat <<USAGE
Usage:
  sudo bash scripts/cleanup-ubuntu-24.04.sh [options]

Options:
  --service-name <name>      systemd service name (default: ${SERVICE_NAME})
  --app-dir <path>           App directory (default: ${APP_DIR_DEFAULT})
  --app-port <port>          Primary app port (default: ${APP_PORT})
  --temp-port <port>         Temporary app port (default: ${TEMP_PORT})
  --db-name <name>           PostgreSQL database name (default: ${DB_NAME})
  --db-user <name>           PostgreSQL user/role name (default: ${DB_USER})
  --keep-db                  Keep PostgreSQL DB/user (do not drop)
  --remove-app-dir           Delete full app directory
  --yes                      Non-interactive confirmation
  -h, --help                 Show this help

Examples:
  sudo bash scripts/cleanup-ubuntu-24.04.sh --yes
  sudo bash scripts/cleanup-ubuntu-24.04.sh --remove-app-dir --yes
  sudo bash scripts/cleanup-ubuntu-24.04.sh --keep-db --yes
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service-name)
      SERVICE_NAME="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --app-port)
      APP_PORT="$2"
      shift 2
      ;;
    --temp-port)
      TEMP_PORT="$2"
      shift 2
      ;;
    --db-name)
      DB_NAME="$2"
      shift 2
      ;;
    --db-user)
      DB_USER="$2"
      shift 2
      ;;
    --keep-db)
      KEEP_DB="true"
      shift
      ;;
    --remove-app-dir)
      REMOVE_APP_DIR="true"
      shift
      ;;
    --yes)
      YES="true"
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

run_as_user() {
  local user="$1"
  shift

  if [[ "${EUID}" -eq 0 ]]; then
    runuser -u "${user}" -- "$@"
  else
    if ! command -v sudo >/dev/null 2>&1; then
      echo "Error: sudo is required when not running as root" >&2
      exit 1
    fi
    sudo -u "${user}" "$@"
  fi
}

log() {
  printf "\n[%s] %s\n" "$(date +"%Y-%m-%d %H:%M:%S")" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

require_ubuntu_24() {
  if [[ ! -f /etc/os-release ]]; then
    echo "Error: /etc/os-release not found; unsupported system" >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
    echo "Error: This script is intended for Ubuntu 24.04 (detected: ${ID:-unknown} ${VERSION_ID:-unknown})" >&2
    exit 1
  fi
}

validate_identifier() {
  local value="$1"
  local label="$2"
  if [[ ! "${value}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Error: ${label} must match ^[a-zA-Z_][a-zA-Z0-9_]*$ (got '${value}')" >&2
    exit 1
  fi
}

confirm_action() {
  if [[ "${YES}" == "true" ]]; then
    return
  fi

  cat <<WARN

This will cleanup deployment resources for ${SERVICE_NAME}:
- systemd service/unit
- Nginx site/snippet config
- processes listening on ports ${APP_PORT}/${TEMP_PORT}
- PostgreSQL DB/user (${DB_NAME}/${DB_USER}) unless --keep-db
- app runtime artifacts (node_modules/.next/.env.production) or full app dir if --remove-app-dir

Type CLEANUP to continue:
WARN

  local input
  read -r input
  if [[ "${input}" != "CLEANUP" ]]; then
    echo "Aborted."
    exit 1
  fi
}

stop_service() {
  local unit_file="/etc/systemd/system/${SERVICE_NAME}.service"

  log "Stopping systemd service if present"
  if ${SUDO} systemctl list-unit-files | awk '{print $1}' | grep -q "^${SERVICE_NAME}\.service$"; then
    ${SUDO} systemctl stop "${SERVICE_NAME}" || true
    ${SUDO} systemctl disable "${SERVICE_NAME}" || true
  fi

  if [[ -f "${unit_file}" ]]; then
    log "Removing systemd unit ${unit_file}"
    ${SUDO} rm -f "${unit_file}"
    ${SUDO} systemctl daemon-reload
  fi
}

kill_ports() {
  for port in "${APP_PORT}" "${TEMP_PORT}"; do
    if [[ -z "${port}" ]]; then
      continue
    fi

    local pids
    if command -v lsof >/dev/null 2>&1; then
      pids="$( ${SUDO} lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true )"
    else
      pids="$(${SUDO} ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $NF}' | sed -n 's/.*pid=\\([0-9]\\+\\).*/\\1/p' | sort -u | tr '\n' ' ')"
    fi

    if [[ -n "${pids}" ]]; then
      log "Killing processes on port ${port}: ${pids}"
      # shellcheck disable=SC2086
      ${SUDO} kill -9 ${pids} || true
    fi
  done
}

cleanup_nginx() {
  local site_available="/etc/nginx/sites-available/${SERVICE_NAME}.conf"
  local site_enabled="/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
  local snippet="/etc/nginx/snippets/${SERVICE_NAME}-upstream.conf"

  log "Removing Nginx config for ${SERVICE_NAME}"
  ${SUDO} rm -f "${site_enabled}" "${site_available}" "${snippet}"

  if [[ ! -e /etc/nginx/sites-enabled/default && -e /etc/nginx/sites-available/default ]]; then
    ${SUDO} ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
  fi

  if ${SUDO} nginx -t >/dev/null 2>&1; then
    ${SUDO} systemctl reload nginx || true
  else
    log "Nginx config test failed after cleanup; leaving nginx unchanged"
  fi
}

cleanup_db() {
  if [[ "${KEEP_DB}" == "true" ]]; then
    log "Skipping PostgreSQL cleanup (--keep-db)"
    return
  fi

  validate_identifier "${DB_NAME}" "db-name"
  validate_identifier "${DB_USER}" "db-user"

  log "Dropping PostgreSQL database/user if they exist"
  run_as_user postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS ${DB_NAME};
DROP ROLE IF EXISTS ${DB_USER};
SQL
}

cleanup_app_files() {
  if [[ "${REMOVE_APP_DIR}" == "true" ]]; then
    if [[ -d "${APP_DIR}" ]]; then
      log "Removing app directory ${APP_DIR}"
      ${SUDO} rm -rf "${APP_DIR}"
    fi
    return
  fi

  if [[ ! -d "${APP_DIR}" ]]; then
    log "App directory ${APP_DIR} not found; skipping app file cleanup"
    return
  fi

  log "Removing runtime artifacts in ${APP_DIR}"
  ${SUDO} rm -rf "${APP_DIR}/node_modules" "${APP_DIR}/.next"
  ${SUDO} rm -f "${APP_DIR}/.env.production"
}

show_summary() {
  log "Cleanup completed"
  cat <<SUMMARY

Reinstall command:
  sudo bash scripts/install-ubuntu-24.04.sh --skip-tls

Or with domain+TLS:
  sudo bash scripts/install-ubuntu-24.04.sh --domain your.domain.com --email you@domain.com

Checks:
  sudo systemctl status ${SERVICE_NAME}
  sudo nginx -t
SUMMARY
}

main() {
  require_ubuntu_24
  require_cmd systemctl
  require_cmd nginx
  require_cmd ss
  require_cmd psql

  confirm_action
  stop_service
  kill_ports
  cleanup_nginx
  cleanup_db
  cleanup_app_files
  show_summary
}

main "$@"
