# Coolify production deployment

The current deployment target is the shared VPS `headless.webxpoint0.com`
(`102.208.216.219`), managed at https://apps.virdict.com. The production hostname
is https://reebok.williamson.co.za. This installation starts with a new database;
existing records and uploaded files from the old VPS are not imported.

## Application and database

- Repository: `PeterFrenchSA/reebok`, branch `main`.
- Build with the root Dockerfile; internal HTTP port 3000, no public host port.
- Health check: HTTP `127.0.0.1:3000/api/health` (also verifies PostgreSQL access).
- Create a private Coolify PostgreSQL 16 database with dedicated credentials.
- Mount a persistent volume at `/app/public/uploads`, owned by UID/GID 1000.
- Keep one application instance while rate limiting remains process-local.
- Set `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `APP_BASE_URL`, and
  `APP_RELEASE` as runtime-only variables in Coolify. Generate strong secrets.
- Set `ALLOW_DEV_AUTH_HEADERS=false` and `SEED_DEMO_USERS=false`.
- Set SMTP, OCR and Telegram credentials separately when those integrations are
  configured. An unset integration is not automatically enabled by deployment.

The container runs as the unprivileged Node user. The build uses a dummy database
URL; production credentials are never required for image builds. The image includes
the pinned Prisma and tsx tools for explicit operational tasks. Startup does not
run schema changes, seed users or reset data.

## First installation only

Keep the new app protected until the database and administrator are ready. Confirm
the database identity and that it is empty before running `prisma db push` from
the app container. Never use reset or data-loss acceptance flags. This clean
installation does not run the seed script: no sample rooms, rates, users or
historical records are inserted. Configure the property through the admin portal.

Create the explicitly named administrator using `scripts/create-admin.ts`, passing
the `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a generated
`BOOTSTRAP_ADMIN_PASSWORD` privately for that invocation only. Do not commit or
permanently save bootstrap variables in the application's runtime environment.

Verify administrator login, an authenticated page and database health before
removing temporary protection and changing DNS. Do not erase the old installation.

## Updates and recovery

Run the checks in `AGENTS.md`, commit and push to `main`, then select **Deploy** in
Coolify. Automatic deployments are initially disabled. Database schema changes
require a reviewed plan and backup; a normal image deployment does not apply them.

The legacy `npm run deploy`/Ubuntu scripts target the old standalone server and
must not be used for this Coolify installation.

Back up the PostgreSQL database, uploaded files and Coolify's configuration and
encryption key off-server. Test restoration. Code rollback does not restore the
database. Configure SMTP before relying on invitation, booking-link or reminder
emails; with SMTP unset the current app skips mail delivery.
