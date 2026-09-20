# Telegram Availability Bot

This release uses deterministic buttons and commands, not an AI model. It checks
availability only. It does not create, approve, cancel, or modify bookings.
WhatsApp can later use the same availability service without replacing the booking
rules or adding an AI dependency.

## What Is Included

- Member/admin account linking through a hashed, single-use link valid for 10 minutes.
- A member portal connection page and disconnect control.
- Admin approval and disabling of Telegram groups.
- Whole-house or multi-room selection followed by check-in/check-out calendar buttons.
- Explicit-date shortcut: `/availability 2027-01-08 2027-01-10`.
- Live pending/confirmed occupancy, using South African dates and exclusive checkout.
- Approved-group commands that hand off to private chat. Group membership alone
  does not authorize a user, and results are not broadcast to unknown recipients.
- Expiring database-backed selections, callback scoping, webhook authentication,
  update deduplication and retryable response delivery.
- A session-authenticated `GET /api/v1/availability` website API. Telegram calls
  the same service through its verified webhook, not through administrator cookies.

Current operating limits: 1-90 nights, from today to 548 days ahead. These are
explicit application limits, not Telegram limits. The website calendar uses the
same horizon. Changing these defaults requires updating and testing the shared rules.

## Deployment Prerequisites

Use a supported Node.js version with `--env-file` support (Node 22 LTS is suitable),
PostgreSQL, the existing HTTPS domain, and a working production administrator login.
Back up the database and uploaded files before deployment. No production system or
Telegram account was changed during local development.

Important role change: `SHAREHOLDER` is no longer administrative. Existing
shareholders are not automatically promoted. Ensure a working `SUPER_ADMIN` login
before deploying; use User Administration afterwards to appoint explicit `ADMIN`
accounts. Shareholders retain full read-only financial access under Member >
Financial Records. Finance export and import permissions are separate.

The schema adds the `ADMIN` role, Telegram tables and nullable booking guest counts.
This repository currently uses schema push rather than a committed migration
history. Do not run `prisma migrate deploy` and assume these additions were applied.

From the application directory, after updating the code and taking backups:

```bash
npm ci
node --env-file=.env.production node_modules/prisma/build/index.js db push
npm run build
sudo systemctl restart reebok-house-manager
```

Review any database warning instead of adding `--accept-data-loss`.
Do not run demo seeding on production. Seed demo users are now opt-in with
`SEED_DEMO_USERS=true` in local development, and disabled in production mode.
Fresh installations without any working super-admin must use the explicit
first-admin setup described in the README. Existing installations do not need it.

## Create And Configure The Bot

1. Open Telegram's official `@BotFather`, create a bot with `/newbot`, and choose a
   username. Keep its token secret; do not post it in the family group or a task.
2. Leave group privacy mode enabled. The bot needs explicit commands, not access
   to all family messages. It does not need group administrator rights.
3. Add the following to the server's `.env.production`, using your real values:

```dotenv
APP_BASE_URL="https://your-house-domain.example"
TELEGRAM_BOT_TOKEN="token-from-BotFather"
TELEGRAM_BOT_USERNAME="your_house_bot"
TELEGRAM_WEBHOOK_SECRET="a-long-random-secret"
```

Generate the webhook secret with `openssl rand -hex 32`. Use a different secret
from `SESSION_SECRET` and `CRON_SECRET`. Keep `.env.production` private and outside
Git. Your bot username must not include the `@` prefix.

4. Restart the service to load the settings, then register the webhook:

```bash
sudo systemctl restart reebok-house-manager
node --env-file=.env.production scripts/setup-telegram.mjs
```

The setup script verifies the bot identity, configures its command menu, and sets
the HTTPS webhook plus secret header. It does not discard pending updates or print
the bot token. This is the step that changes the real Telegram account.
If the application is behind Nginx, preserve the Telegram secret header and set
`APP_BASE_URL` to the public HTTPS origin, not localhost.

## Link Members And Approve Groups

1. In the website, sign in and open Member > Connect Telegram.
2. Create a linking link, open it in Telegram and press Start. Return to the website
   and refresh connection status. Do not share the linking URL.
3. Use `/availability` in private chat; choose whole house or rooms, then dates.
4. An appointed administrator links their own account and adds the bot to the
   family group. In that group send `/groupid@your_house_bot`.
5. Enter the returned group ID and a label in Admin > Telegram, then approve it.
6. Linked members can use `/availability@your_house_bot` in the approved group.
   It opens the private flow rather than publishing protected availability there.

Guests, inactive users and unlinked Telegram users cannot query availability.
Disabling a group stops its handoff command. Disconnecting an account stops access
and clears its active selection. Re-link explicitly to change Telegram accounts.

## Reliability And Security Notes

- Pending and approved room bookings block those rooms and whole-house requests;
  whole-house bookings block every room. Rejections release availability.
- Reservation-changing API writes share a PostgreSQL advisory transaction lock.
  API imports also use this guard. Manual SQL writes do not acquire this lock.
- Unknown legacy room allocations fail closed rather than appear available.
- Failed Telegram deliveries return a retryable response. Retried updates reuse
  stored responses instead of repeating account-linking or conversation changes.
- Network ambiguity after Telegram accepts a reply can still produce a duplicate
  message on retry; external delivery is not exactly-once. This release performs
  no booking mutations from chat.
- Responses expire after 30 minutes rather than resend stale availability.
- Request throttling is process-local, consistent with the rest of this app.
  Use shared rate limiting before deploying multiple application instances.
- Real Telegram delivery requires the operator's credentials and HTTPS deployment;
  local tests use a fake outbound transport, never a live bot.
- Other findings in the dated review are not all resolved by this integration.
  In particular, wider finance reconciliation, upload storage/deployment, email
  delivery reliability and dependency advisory remediation still require work.
  Review the remaining P1 findings before expanding production exposure.
- Room selection in chat checks availability only; the current website booking
  form still submits external whole-house bookings. A dedicated member room-booking
  form and bookings from chat remain later work.

## Verification

```bash
npm test
npm run lint
npm run test:integration
```

Integration tests require Docker and an unused local port 3119. The runner creates
a disposable loopback PostgreSQL database, applies the schema, builds the app,
starts a production-mode local server, exercises HTTP/bot/database paths and removes
the test container afterwards. SMTP is disabled and no Telegram API calls are made.
Do not point integration tests at an existing database; the test has a database
name/host guard.

## References

- [Telegram bot features](https://core.telegram.org/bots/features)
- [Telegram webhook configuration](https://core.telegram.org/bots/api#setwebhook)
- [Telegram privacy mode and group commands](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get)
