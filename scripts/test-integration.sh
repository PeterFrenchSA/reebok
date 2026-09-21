#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="reebok-bot-test-$$"
cleanup() { docker rm -fv "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$NAME" -e POSTGRES_USER=reebok_test -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=reebok_bot_test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
for i in {1..30}; do
  if docker exec "$NAME" pg_isready -U reebok_test >/dev/null 2>&1; then break; fi
  sleep 1
done
PORT="$(docker port "$NAME" 5432/tcp | sed 's/.*://')"
export DATABASE_URL="postgresql://reebok_test:local-test-only@127.0.0.1:${PORT}/reebok_bot_test"
export TEST_DATABASE_URL="$DATABASE_URL"
export SESSION_SECRET="isolated-telegram-integration-session-secret"
export CRON_SECRET="isolated-telegram-integration-cron-secret"
export APP_BASE_URL="http://127.0.0.1:3119"
export APP_RELEASE="isolated-integration-test"
export SMTP_HOST="" SMTP_PORT="" SMTP_USER="" SMTP_PASS="" APPROVER_EMAILS=""
export ALLOW_DEV_AUTH_HEADERS=false
export TELEGRAM_BOT_TOKEN="local-test-token-never-sent" TELEGRAM_BOT_USERNAME="reebok_test_bot"
export TELEGRAM_WEBHOOK_SECRET="local_test_webhook_secret_32_characters_long"
npx prisma db push
npm run build
npx tsx --test tests/bot.integration.ts
