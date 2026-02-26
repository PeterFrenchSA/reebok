#!/usr/bin/env bash
set -Eeuo pipefail

# Zero-downtime update script for Ubuntu 24.04.
# Uses temporary blue/green port switching behind Nginx.

SERVICE_NAME="reebok-house-manager"
APP_PORT="3000"
TEMP_PORT="3001"
HEALTH_PATH="/"
HEALTH_TIMEOUT_SEC="90"
GIT_PULL="false"
GIT_REMOTE="origin"
GIT_BRANCH=""
SKIP_MIGRATE="false"
SKIP_BUILD="false"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR_DEFAULT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR_DEFAULT}"
APP_USER="${SUDO_USER:-$USER}"

STAGE_DIR=""
TEMP_PID=""
NGINX_SITE=""
NGINX_SNIPPET=""
NGINX_SWITCHED_TO_TEMP="false"

print_help() {
  cat <<USAGE
Usage:
  sudo bash scripts/update-ubuntu.sh [options]

Options:
  --app-dir <path>           App directory (default: ${APP_DIR_DEFAULT})
  --app-user <user>          Linux user for app process (default: ${APP_USER})
  --service-name <name>      systemd service name (default: ${SERVICE_NAME})
  --app-port <port>          Primary app port (default: ${APP_PORT})
  --temp-port <port>         Temporary port during update (default: ${TEMP_PORT})
  --health-path <path>       Health check path (default: /)
  --health-timeout <sec>     Health check timeout seconds (default: ${HEALTH_TIMEOUT_SEC})
  --git-pull                 Run git fetch/pull before build
  --git-remote <name>        Git remote (default: ${GIT_REMOTE})
  --git-branch <name>        Git branch (default: current branch)
  --skip-migrate             Skip Prisma migration step
  --skip-build               Skip npm build step
  -h, --help                 Show this help

Examples:
  sudo bash scripts/update-ubuntu.sh --git-pull --git-branch main
  sudo bash scripts/update-ubuntu.sh --app-dir /opt/reebok-house-manager --app-user ubuntu
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --app-user)
      APP_USER="$2"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="$2"
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
    --health-path)
      HEALTH_PATH="$2"
      shift 2
      ;;
    --health-timeout)
      HEALTH_TIMEOUT_SEC="$2"
      shift 2
      ;;
    --git-pull)
      GIT_PULL="true"
      shift
      ;;
    --git-remote)
      GIT_REMOTE="$2"
      shift 2
      ;;
    --git-branch)
      GIT_BRANCH="$2"
      shift 2
      ;;
    --skip-migrate)
      SKIP_MIGRATE="true"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="true"
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

if [[ "${APP_PORT}" == "${TEMP_PORT}" ]]; then
  echo "Error: --app-port and --temp-port must be different" >&2
  exit 1
fi

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "Error: package.json not found in APP_DIR=${APP_DIR}" >&2
  exit 1
fi

if [[ ! -f "${APP_DIR}/.env.production" ]]; then
  echo "Error: ${APP_DIR}/.env.production not found" >&2
  exit 1
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  echo "Error: app user '${APP_USER}' does not exist" >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

log() {
  printf "\n[%s] %s\n" "$(date +"%Y-%m-%d %H:%M:%S")" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

prepare_paths() {
  NGINX_SITE="/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
  NGINX_SNIPPET="/etc/nginx/snippets/${SERVICE_NAME}-upstream.conf"

  if [[ ! -f "${NGINX_SITE}" ]]; then
    echo "Error: nginx site file not found at ${NGINX_SITE}" >&2
    exit 1
  fi

  if [[ ! -f "${NGINX_SNIPPET}" ]]; then
    log "Creating missing nginx upstream snippet ${NGINX_SNIPPET}"
    ${SUDO} tee "${NGINX_SNIPPET}" >/dev/null <<SNIPPET
set \$reebok_upstream http://127.0.0.1:${APP_PORT};
SNIPPET
  fi

  if ! ${SUDO} grep -q "include ${NGINX_SNIPPET};" "${NGINX_SITE}"; then
    log "Patching nginx site to include upstream snippet"
    ${SUDO} sed -i -E "s@(server_name[^;]*;)@\1\n    include ${NGINX_SNIPPET};@" "${NGINX_SITE}"
  fi

  if ${SUDO} grep -qE "proxy_pass http://127\.0\.0\.1:[0-9]+;" "${NGINX_SITE}"; then
    log "Patching nginx site proxy_pass to use variable upstream"
    ${SUDO} sed -i -E 's@proxy_pass http://127\.0\.0\.1:[0-9]+;@proxy_pass \$reebok_upstream;@' "${NGINX_SITE}"
  fi
}

health_check() {
  local port="$1"
  local path="$2"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SEC))
  local url="http://127.0.0.1:${port}${path}"

  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 3 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

switch_nginx_port() {
  local port="$1"

  ${SUDO} tee "${NGINX_SNIPPET}" >/dev/null <<SNIPPET
set \$reebok_upstream http://127.0.0.1:${port};
SNIPPET

  ${SUDO} nginx -t
  ${SUDO} systemctl reload nginx
}

git_pull_if_requested() {
  if [[ "${GIT_PULL}" != "true" ]]; then
    return
  fi

  if [[ ! -d "${APP_DIR}/.git" ]]; then
    echo "Error: --git-pull requested but ${APP_DIR} is not a git repository" >&2
    exit 1
  fi

  log "Running git fetch/pull"
  if [[ -z "${GIT_BRANCH}" ]]; then
    ${SUDO} -u "${APP_USER}" bash -lc "cd \"${APP_DIR}\" && git fetch ${GIT_REMOTE} --prune && git pull --ff-only"
  else
    ${SUDO} -u "${APP_USER}" bash -lc "cd \"${APP_DIR}\" && git fetch ${GIT_REMOTE} --prune && git checkout ${GIT_BRANCH} && git pull --ff-only ${GIT_REMOTE} ${GIT_BRANCH}"
  fi
}

create_stage_release() {
  local ts
  ts="$(date +"%Y%m%d%H%M%S")"
  STAGE_DIR="/tmp/${SERVICE_NAME}-stage-${ts}"

  log "Creating staged release at ${STAGE_DIR}"
  ${SUDO} rm -rf "${STAGE_DIR}"
  ${SUDO} mkdir -p "${STAGE_DIR}"

  ${SUDO} rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env' \
    --exclude '.env.production' \
    "${APP_DIR}/" "${STAGE_DIR}/"

  ${SUDO} cp "${APP_DIR}/.env.production" "${STAGE_DIR}/.env.production"
  ${SUDO} chown -R "${APP_USER}:${APP_USER}" "${STAGE_DIR}"
}

build_stage_release() {
  log "Installing dependencies in staged release"
  if [[ -f "${STAGE_DIR}/package-lock.json" ]]; then
    ${SUDO} -u "${APP_USER}" bash -lc "cd \"${STAGE_DIR}\" && npm ci"
  else
    ${SUDO} -u "${APP_USER}" bash -lc "cd \"${STAGE_DIR}\" && npm install"
  fi

  ${SUDO} -u "${APP_USER}" bash -lc "set -a; source \"${STAGE_DIR}/.env.production\"; set +a; cd \"${STAGE_DIR}\"; npm run prisma:generate"

  if [[ "${SKIP_MIGRATE}" != "true" ]]; then
    if compgen -G "${STAGE_DIR}/prisma/migrations/*/migration.sql" >/dev/null; then
      ${SUDO} -u "${APP_USER}" bash -lc "set -a; source \"${STAGE_DIR}/.env.production\"; set +a; cd \"${STAGE_DIR}\"; npx prisma migrate deploy"
    else
      ${SUDO} -u "${APP_USER}" bash -lc "set -a; source \"${STAGE_DIR}/.env.production\"; set +a; cd \"${STAGE_DIR}\"; npx prisma db push"
    fi
  fi

  if [[ "${SKIP_BUILD}" != "true" ]]; then
    log "Building staged release"
    ${SUDO} -u "${APP_USER}" bash -lc "set -a; source \"${STAGE_DIR}/.env.production\"; set +a; cd \"${STAGE_DIR}\"; npm run build"
  fi
}

start_temp_server() {
  log "Starting temporary server on port ${TEMP_PORT}"
  ${SUDO} -u "${APP_USER}" bash -lc "set -a; source \"${STAGE_DIR}/.env.production\"; set +a; cd \"${STAGE_DIR}\"; nohup npm run start -- -p ${TEMP_PORT} > \"${STAGE_DIR}/temp-server.log\" 2>&1 & echo \$! > \"${STAGE_DIR}/temp-server.pid\""

  TEMP_PID="$(cat "${STAGE_DIR}/temp-server.pid")"

  if ! health_check "${TEMP_PORT}" "${HEALTH_PATH}"; then
    echo "Error: temporary server failed health check on port ${TEMP_PORT}" >&2
    ${SUDO} -u "${APP_USER}" bash -lc "kill -9 ${TEMP_PID} >/dev/null 2>&1 || true"
    exit 1
  fi
}

deploy_to_primary() {
  log "Switching Nginx traffic to temporary server (${TEMP_PORT})"
  switch_nginx_port "${TEMP_PORT}"
  NGINX_SWITCHED_TO_TEMP="true"

  if ! health_check "${TEMP_PORT}" "${HEALTH_PATH}"; then
    echo "Error: temporary server unhealthy after nginx switch" >&2
    exit 1
  fi

  log "Stopping primary service ${SERVICE_NAME}"
  ${SUDO} systemctl stop "${SERVICE_NAME}"

  log "Syncing staged release to ${APP_DIR}"
  ${SUDO} rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.production' \
    --exclude '.git' \
    "${STAGE_DIR}/" "${APP_DIR}/"
  ${SUDO} chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

  log "Starting primary service ${SERVICE_NAME}"
  ${SUDO} systemctl start "${SERVICE_NAME}"

  if ! health_check "${APP_PORT}" "${HEALTH_PATH}"; then
    echo "Error: primary service failed health check on port ${APP_PORT}" >&2
    echo "Traffic is still routed to temporary server on ${TEMP_PORT}." >&2
    echo "Inspect logs: sudo journalctl -u ${SERVICE_NAME} -n 200 --no-pager" >&2
    exit 1
  fi

  log "Switching Nginx traffic back to primary service (${APP_PORT})"
  switch_nginx_port "${APP_PORT}"
  NGINX_SWITCHED_TO_TEMP="false"
}

cleanup() {
  local rc="$?"

  if [[ "${rc}" -ne 0 ]]; then
    if [[ "${NGINX_SWITCHED_TO_TEMP}" == "true" ]]; then
      echo "Update failed. Traffic is still routed to temporary instance on port ${TEMP_PORT}." >&2
      echo "Temporary stage dir retained: ${STAGE_DIR}" >&2
      echo "To inspect temp logs: sudo tail -n 200 ${STAGE_DIR}/temp-server.log" >&2
      echo "After fixing, rerun this script to converge back to primary service." >&2
      exit "${rc}"
    fi

    if [[ -n "${TEMP_PID}" ]]; then
      ${SUDO} -u "${APP_USER}" bash -lc "kill -9 ${TEMP_PID} >/dev/null 2>&1 || true"
    fi

    if [[ -n "${STAGE_DIR}" && -d "${STAGE_DIR}" ]]; then
      ${SUDO} rm -rf "${STAGE_DIR}"
    fi

    exit "${rc}"
  fi

  if [[ -n "${TEMP_PID}" ]]; then
    ${SUDO} -u "${APP_USER}" bash -lc "kill -9 ${TEMP_PID} >/dev/null 2>&1 || true"
  fi

  if [[ -n "${STAGE_DIR}" && -d "${STAGE_DIR}" ]]; then
    ${SUDO} rm -rf "${STAGE_DIR}"
  fi
}
trap cleanup EXIT

main() {
  require_cmd node
  require_cmd npm
  require_cmd rsync
  require_cmd curl
  require_cmd nginx
  require_cmd systemctl

  prepare_paths

  log "Checking current service health on primary port ${APP_PORT}"
  if ! health_check "${APP_PORT}" "${HEALTH_PATH}"; then
    log "Primary service not currently healthy on ${APP_PORT}; continuing update anyway"
  fi

  git_pull_if_requested
  create_stage_release
  build_stage_release
  start_temp_server
  deploy_to_primary

  log "Zero-downtime update completed successfully"
  echo "Service status:"
  echo "  sudo systemctl status ${SERVICE_NAME}"
  echo "  sudo journalctl -u ${SERVICE_NAME} -f"
}

main "$@"
