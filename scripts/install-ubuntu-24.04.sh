#!/usr/bin/env bash
set -Eeuo pipefail

# Ubuntu 24.04 deployment script for Reebok House Manager.
# Installs Node.js, PostgreSQL, Nginx, systemd service, and optional Let's Encrypt TLS.

SERVICE_NAME="reebok-house-manager"
APP_PORT="3000"
DOMAIN=""
LE_EMAIL=""
DB_NAME="reebok_house"
DB_USER="reebok_app"
DB_PASSWORD=""
DB_PASSWORD_URL_ENC=""
SESSION_SECRET=""
APP_USER="${SUDO_USER:-$USER}"
SKIP_TLS="false"
SKIP_SEED="false"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR_DEFAULT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR_DEFAULT}"

print_help() {
  cat <<USAGE
Usage:
  sudo bash scripts/install-ubuntu-24.04.sh [options]

Options:
  --app-dir <path>           App directory (default: ${APP_DIR_DEFAULT})
  --app-user <user>          Linux user to run app service (default: ${APP_USER})
  --port <port>              App port for Next.js (default: ${APP_PORT})
  --domain <fqdn>            Domain for Nginx server_name (optional)
  --email <email>            Email for Let's Encrypt (required when --domain used unless --skip-tls)
  --db-name <name>           PostgreSQL database name (default: ${DB_NAME})
  --db-user <user>           PostgreSQL database user (default: ${DB_USER})
  --db-password <password>   PostgreSQL user password (default: auto-generated)
  --skip-tls                 Skip certbot TLS setup
  --skip-seed                Skip prisma seed step
  -h, --help                 Show this help

Examples:
  sudo bash scripts/install-ubuntu-24.04.sh --domain house.example.com --email admin@example.com
  sudo bash scripts/install-ubuntu-24.04.sh --app-dir /opt/reebok-house-manager --app-user ubuntu --skip-tls
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
    --port)
      APP_PORT="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --email)
      LE_EMAIL="$2"
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
    --db-password)
      DB_PASSWORD="$2"
      shift 2
      ;;
    --skip-tls)
      SKIP_TLS="true"
      shift
      ;;
    --skip-seed)
      SKIP_SEED="true"
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

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "Error: package.json not found in APP_DIR=${APP_DIR}" >&2
  exit 1
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  echo "Error: app user '${APP_USER}' does not exist" >&2
  exit 1
fi

if [[ -n "${DOMAIN}" && "${SKIP_TLS}" != "true" && -z "${LE_EMAIL}" ]]; then
  echo "Error: --email is required when using --domain with TLS" >&2
  exit 1
fi

validate_identifier() {
  local value="$1"
  local label="$2"
  if [[ ! "${value}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Error: ${label} must match ^[a-zA-Z_][a-zA-Z0-9_]*$ (got '${value}')" >&2
    exit 1
  fi
}

validate_identifier "${DB_NAME}" "db-name"
validate_identifier "${DB_USER}" "db-user"

if [[ -z "${DB_PASSWORD}" ]]; then
  DB_PASSWORD="$(openssl rand -base64 33 | tr -d '\n' | tr '/+' 'Aa' | cut -c1-32)"
fi

if [[ -z "${SESSION_SECRET}" ]]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
fi

urlencode() {
  local raw="$1"
  local out=""
  local i char hex
  for ((i = 0; i < ${#raw}; i++)); do
    char="${raw:i:1}"
    case "${char}" in
      [a-zA-Z0-9.~_-])
        out+="${char}"
        ;;
      *)
        printf -v hex '%%%02X' "'${char}"
        out+="${hex}"
        ;;
    esac
  done
  printf "%s" "${out}"
}

DB_PASSWORD_URL_ENC="$(urlencode "${DB_PASSWORD}")"

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

install_base_packages() {
  log "Installing system packages"
  ${SUDO} apt-get update -y
  ${SUDO} apt-get install -y ca-certificates curl gnupg lsb-release software-properties-common git build-essential ufw nginx postgresql postgresql-contrib
}

install_nodejs() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "${major}" -ge 20 ]]; then
      log "Node.js already installed ($(node -v))"
      return
    fi
  fi

  log "Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | ${SUDO} bash -
  ${SUDO} apt-get install -y nodejs
  ${SUDO} corepack enable || true
}

configure_postgres() {
  log "Configuring PostgreSQL"
  ${SUDO} systemctl enable --now postgresql
  local sql_db_password
  sql_db_password="$(printf "%s" "${DB_PASSWORD}" | sed "s/'/''/g")"

  run_as_user postgres psql -v ON_ERROR_STOP=1 <<SQL
DO
\$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
      CREATE ROLE ${DB_USER} LOGIN PASSWORD '${sql_db_password}';
   ELSE
      ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${sql_db_password}';
   END IF;
END
\$\$;
SQL

  run_as_user postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    run_as_user postgres createdb -O "${DB_USER}" "${DB_NAME}"

  run_as_user postgres psql -v ON_ERROR_STOP=1 <<SQL
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
}

write_env_file() {
  local env_file="${APP_DIR}/.env.production"
  local base_url="http://127.0.0.1:${APP_PORT}"
  if [[ -n "${DOMAIN}" ]]; then
    base_url="https://${DOMAIN}"
  fi

  log "Writing ${env_file}"
  if [[ ! -f "${env_file}" ]]; then
    cp "${APP_DIR}/.env.example" "${env_file}"
  fi

  ${SUDO} chmod 600 "${env_file}" || true

  upsert_env "${env_file}" "DATABASE_URL" "postgresql://${DB_USER}:${DB_PASSWORD_URL_ENC}@localhost:5432/${DB_NAME}"
  upsert_env "${env_file}" "NODE_ENV" "production"
  upsert_env "${env_file}" "PORT" "${APP_PORT}"
  upsert_env "${env_file}" "APP_BASE_URL" "${base_url}"

  local existing_session_secret
  existing_session_secret="$(${SUDO} sed -n -E 's/^SESSION_SECRET="?([^"]*)"?$/\1/p' "${env_file}" | tail -n 1)"
  if [[ -z "${existing_session_secret}" || "${existing_session_secret}" == "change-this-to-a-long-random-string" ]]; then
    upsert_env "${env_file}" "SESSION_SECRET" "${SESSION_SECRET}"
  fi

  ${SUDO} chown "${APP_USER}:${APP_USER}" "${env_file}"
}

upsert_env() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(printf "%s" "${value}" | sed -e 's/[\\/&]/\\&/g' -e 's/"/\\"/g')"

  if ${SUDO} grep -qE "^${key}=" "${env_file}"; then
    ${SUDO} sed -i -E "s/^${key}=.*/${key}=\"${escaped}\"/" "${env_file}"
  else
    echo "${key}=\"${value}\"" | ${SUDO} tee -a "${env_file}" >/dev/null
  fi
}

install_app_dependencies() {
  log "Installing app dependencies"
  cd "${APP_DIR}"

  if [[ -f "package-lock.json" ]]; then
    run_as_user "${APP_USER}" npm ci
  else
    run_as_user "${APP_USER}" npm install
  fi
}

run_prisma_and_build() {
  log "Running Prisma and building app"
  cd "${APP_DIR}"

  ${SUDO} mkdir -p "${APP_DIR}/public/uploads"
  ${SUDO} chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/public/uploads"

  run_as_user "${APP_USER}" bash -lc "cd \"${APP_DIR}\" && npm run prisma:generate"

  if compgen -G "${APP_DIR}/prisma/migrations/*/migration.sql" >/dev/null; then
    run_as_user "${APP_USER}" bash -lc "set -a; source \"${APP_DIR}/.env.production\"; set +a; cd \"${APP_DIR}\"; npx prisma migrate deploy"
  else
    run_as_user "${APP_USER}" bash -lc "set -a; source \"${APP_DIR}/.env.production\"; set +a; cd \"${APP_DIR}\"; npx prisma db push"
  fi

  if [[ "${SKIP_SEED}" != "true" ]]; then
    log "Seeding baseline data and sample users"
    run_as_user "${APP_USER}" bash -lc "set -a; source \"${APP_DIR}/.env.production\"; set +a; cd \"${APP_DIR}\"; npm run prisma:seed"
  fi

  run_as_user "${APP_USER}" bash -lc "set -a; source \"${APP_DIR}/.env.production\"; set +a; cd \"${APP_DIR}\"; npm run build"
}

create_systemd_service() {
  log "Creating systemd service ${SERVICE_NAME}"

  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  ${SUDO} tee "${service_file}" >/dev/null <<SERVICE
[Unit]
Description=Reebok House Manager (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env.production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- -p ${APP_PORT}
Restart=always
RestartSec=5
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
SERVICE

  ${SUDO} systemctl daemon-reload
  ${SUDO} systemctl enable --now "${SERVICE_NAME}"
  ${SUDO} systemctl restart "${SERVICE_NAME}"
}

configure_nginx() {
  log "Configuring Nginx"

  local site_file="/etc/nginx/sites-available/${SERVICE_NAME}.conf"
  local upstream_snippet="/etc/nginx/snippets/${SERVICE_NAME}-upstream.conf"
  local server_name="_"
  if [[ -n "${DOMAIN}" ]]; then
    server_name="${DOMAIN}"
  fi

  ${SUDO} tee "${upstream_snippet}" >/dev/null <<UPSTREAM
set \$reebok_upstream http://127.0.0.1:${APP_PORT};
UPSTREAM

  ${SUDO} tee "${site_file}" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};
    include ${upstream_snippet};

    client_max_body_size 25m;

    location / {
        proxy_pass \$reebok_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

  ${SUDO} ln -sf "${site_file}" "/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
  ${SUDO} rm -f /etc/nginx/sites-enabled/default
  ${SUDO} nginx -t
  ${SUDO} systemctl enable --now nginx
  ${SUDO} systemctl restart nginx
}

configure_firewall() {
  log "Configuring UFW"
  ${SUDO} ufw allow OpenSSH >/dev/null 2>&1 || true
  ${SUDO} ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ${SUDO} ufw --force enable >/dev/null 2>&1 || true
}

configure_tls() {
  if [[ -z "${DOMAIN}" || "${SKIP_TLS}" == "true" ]]; then
    log "Skipping TLS setup"
    return
  fi

  log "Installing certbot and requesting TLS certificate"
  ${SUDO} apt-get install -y certbot python3-certbot-nginx
  if ! ${SUDO} certbot --nginx -d "${DOMAIN}" --agree-tos --no-eff-email -m "${LE_EMAIL}" --non-interactive --redirect; then
    log "TLS setup failed. Confirm DNS for ${DOMAIN} points to this server, then run certbot again."
  fi
}

show_summary() {
  local base_url="http://SERVER_IP"
  if [[ -n "${DOMAIN}" ]]; then
    base_url="https://${DOMAIN}"
  fi

  log "Deployment complete"
  cat <<SUMMARY

Service:
  sudo systemctl status ${SERVICE_NAME}
  sudo journalctl -u ${SERVICE_NAME} -f

Nginx:
  sudo nginx -t
  sudo systemctl status nginx

App URL:
  ${base_url}

Important:
  - Production env file: ${APP_DIR}/.env.production
  - Database user: ${DB_USER}
  - Database name: ${DB_NAME}
  - Generated DB password: ${DB_PASSWORD}

Next recommended steps:
  1. Edit ${APP_DIR}/.env.production with SMTP, payment gateway, and OpenAI keys.
  2. Restart app after env changes: sudo systemctl restart ${SERVICE_NAME}
  3. Set CRON_SECRET in env and schedule /api/jobs/subscription-reminders.
SUMMARY
}

main() {
  require_ubuntu_24
  install_base_packages
  install_nodejs
  configure_postgres
  write_env_file

  ${SUDO} chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

  install_app_dependencies
  run_prisma_and_build
  create_systemd_service
  configure_nginx
  configure_firewall
  configure_tls
  show_summary
}

main "$@"
