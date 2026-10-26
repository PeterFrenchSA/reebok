# Coolify production deployment

The application is already deployed through **[Coolify at apps.virdict.com](https://apps.virdict.com)**.
The user confirmed this deployment context on 2026-10-22. It supersedes the old
standalone `reebok.williamson.co.za` deployment and earlier chat instructions.

Use the existing application resource in Coolify as the source of truth for its
server, public domain, runtime settings and persistent storage. The Coolify
management URL is not automatically the application's public URL. Verify the
configured application domain before setting `APP_BASE_URL`, generating email
links or registering Telegram webhooks; do not reuse the old hostname by default.

Verified through the Coolify API and SSH on 2026-10-26:

- Application: `Reebok House Manager`, UUID `rp0ajs1n448zkc2kdp0ll6hx`.
- Public app URL: `https://reebok.williamson.co.za`. This hostname now points to
  the Coolify application, not the retired standalone installation.
- Coolify host: `root@headless.webxpoint0.com` (`102.208.216.219`), using the
  existing trusted SSH key. Use SSH only for scoped backups/verification and
  reviewed database operations, not the legacy deployment scripts.
- Automatic deployments are disabled; recheck this before pushing or triggering
  a new release. Reconfirm these identities if Coolify configuration changes.

The initial Coolify installation used a separate database without importing old
VPS records or uploads. It is now an existing installation: preserve its database
and upload volumes, and do not repeat first-install or reset steps for updates.

## Application and database

- Repository: `PeterFrenchSA/reebok`, branch `main`.
- Build with the root Dockerfile; internal HTTP port 3000, no public host port.
- Health check: HTTP `127.0.0.1:3000/api/health` (also verifies PostgreSQL access).
- Preserve the existing private Coolify PostgreSQL database and its credentials.
- Preserve the persistent volume at `/app/public/uploads`, owned by UID/GID 1000.
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

## First installation only (not routine updates)

The current app is already installed. These steps are only for a separately
approved new installation, not redeployment of the existing Coolify resource.
Provision a private PostgreSQL 16 database and a persistent uploads volume only
when creating that new installation.

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
Coolify. Check the resource's current automatic-deployment setting before manually
triggering a deployment. Database schema changes require a reviewed plan and
backup; a normal image deployment does not apply them.

The legacy `npm run deploy`/Ubuntu scripts target the old standalone server and
must not be used for this Coolify installation.

Back up the PostgreSQL database, uploaded files and Coolify's configuration and
encryption key off-server. Test restoration. Code rollback does not restore the
database. Configure SMTP before relying on invitation, booking-link or reminder
emails; with SMTP unset the current app skips mail delivery.

## User guide and private app feedback rollout

This release adds `/admin/guide`, `/admin/app-feedback` and the shareable
`/docs/reebok-family-overview.pdf`. The detailed guide and feedback board require
an active appointed administrator; the family PDF intentionally contains no
private account data and may be shared publicly.

App Feedback requires two new tables (`AppFeedbackThread`, `AppFeedbackEntry`),
two enums, their indexes and author/thread foreign keys. Existing guest feedback
is separate and is not converted or published. Entries retain replies and status
history; there are no delete/edit, file attachment or email notification controls.

Before enabling this release in Coolify:

1. Back up the current PostgreSQL database and uploads. Verify the target database
   and keep the old application version available for code recovery.
2. Review the schema difference using the new release's pinned Prisma CLI.
   Expect only the additive feedback models/enums/indexes/foreign keys; do not
   accept unrelated removals or reset/data-loss flags. This repository does not
   have a baseline Prisma migration history.
3. Apply the reviewed schema using `node node_modules/prisma/build/index.js db push`
   from the new application image with the existing Coolify runtime credentials,
   before opening the new feedback page to users. This is a deliberate operator
   step, not a container startup command. Do not run seeds or bootstrap accounts.
4. Deploy through the existing Coolify resource. Verify admin login, guide/PDF
   access, feedback creation/reply/status history and member/shareholder denial.
   `APP_BASE_URL` must match the app's HTTPS origin for browser feedback writes;
   it must not point to the Coolify control panel.

Code rollback does not require dropping the new tables. Preserve feedback records
even if an older app image is temporarily restored. No live schema change or
deployment is performed merely by adding these files to the repository.

Guide content is maintained in `src/lib/user-guide.ts`; the one-page PDF source
is `scripts/generate-family-overview.py` (ReportLab and pypdf required). Regeneration
writes `output/pdf/reebok-family-overview.pdf` and the matching public download.
