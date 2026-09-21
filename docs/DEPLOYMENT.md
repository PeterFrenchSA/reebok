# Deploy From Your Mac

Target: `root@reebok.williamson.co.za`, using your existing SSH key/agent.
This is a clean application deployment, not a server wipe. It reuses the existing
Ubuntu 24.04, PostgreSQL, Nginx/HTTPS and non-root `reebok-house-manager` service.
Normal `deploy` retains existing records. The explicitly selected `fresh` operation
starts a separate empty database and upload folder after backing up the old app;
it does not erase the old database. Neither operation deletes unrelated services,
changes DNS, issues certificates, or pushes anything to GitHub.

## Before The First Deployment

1. Choose `deploy` to retain existing data, or the one-time `fresh` bootstrap below
   to start empty. There is no destructive database-reset option.
2. Review outstanding security findings in `REVIEW-2026-09-20.md`. A working
   deployment script is not evidence that the full application is production-hardened.
3. For data-preserving deployment, ensure you have a working `SUPER_ADMIN` login and replace any sample passwords.
   The new `ADMIN` role replaces shareholder administrative privileges. Shareholders
   retain read-only finances. The runner refuses deployment without an active
   super-admin with a password. Fresh bootstrap instead creates your explicitly
   named super-admin; neither operation creates demo accounts or runs the seed.
4. Commit the local changes you want to deploy. The tool refuses a dirty checkout
   and sends a Git archive of the selected commit, not your local environment files,
   uploads, Mac dependencies or build output. No GitHub push is necessary.
5. Verify SSH works normally. The tool requires an already trusted host key and
   will not bypass host-key verification or prompt for SSH passwords.

Read-only inspection:

```bash
npm run deploy -- check
npm run deploy -- status
```

The server was inspected read-only during development: Ubuntu 24.04.5, Node
20.20.2, PostgreSQL client 16.15, app user `ubuntu`, port 3000, and the existing
HTTPS Nginx site. The original checkout had local edits; no attempt was made to
reset, merge, or overwrite them.

The data-preserving preflight reports noncompliant `SESSION_SECRET` and `CRON_SECRET`.
Fresh bootstrap generates replacements automatically; skip the manual secret
changes below if choosing `fresh`. For data-preserving deployment, update them
on the server, not in Git:

```bash
ssh -t root@reebok.williamson.co.za
openssl rand -hex 32
openssl rand -hex 32
nano /opt/reebok-house-manager/.env.production
```

Use the two independent generated values for `SESSION_SECRET` and `CRON_SECRET`.
Keep the existing database/SMTP credentials. `APP_BASE_URL` must be
`https://reebok.williamson.co.za`; development impersonation and demo seeding must
not be enabled. Changing the session secret invalidates existing sessions after
restart; update any scheduled-job caller to use the new cron secret. Do not paste
credentials into chat or commit them.
Environment values must be literal values, not shell commands or variable-expansion
expressions. The deployer parses the file as data and never sources it as a shell script.

## Fresh Installation With Empty Data

This is the selected rollout approach for this server. It is a one-time bootstrap
for the existing unmanaged installation, not a repeatable reset button.

After committing the deployment changes, replace the example identity with the
actual administrator's email and name:

```bash
npm run deploy -- check-fresh
npm run deploy -- fresh --admin-email you@example.com --admin-name "Your Name"
```

The preflight is read-only and accepts the existing weak session/cron settings
because fresh bootstrap replaces them. The second command prompts for `fresh`.
It performs these steps:

1. Builds committed source as the app user without changing the running service.
2. Stops the old app and backs up its database, source, settings and uploads.
   If a backup fails, the old app is restarted; no new database is created.
3. Creates a unique `reebok_fresh_*` database on this server's PostgreSQL, owned
   by the existing database role. The original database remains untouched.
4. Initializes only the new database schema and creates one active `SUPER_ADMIN`
   using the supplied identity and a randomly generated 32-character password.
   No demo users, bookings, financial records, rooms or sample rates are seeded.
5. Switches to an empty shared upload folder and new server-generated session/cron
   secrets, keeping SMTP and other existing integration configuration.
6. Checks database health and the release through HTTPS. On activation failure,
   the original service configuration is restored and its health checked.

The initial password is written only to the root-readable `initial-admin.json`
inside the printed backup directory. It is not sent to Git, chat or the deployment
log. Retrieve it in your own SSH terminal, sign in, and change it through User
Administration. The file is a sensitive recovery artifact; keep backups protected.
There is no automatic first-login password-change screen.

Before inviting users, configure rooms, rates, useful information and contact
numbers. The application has built-in fallback content/rates, which must be
reviewed even though the bootstrap imports no sample records. Recreate any desired
bulletins, templates, member accounts and bot links in the new installation.
Update existing scheduled-job callers to the new `CRON_SECRET`; do not re-enable
them until the new configuration is ready. Telegram activation is separate.

The old environment file, database and uploads remain isolated from the new app.
The first fresh release intentionally has no code rollback to the legacy data:
that would silently reintroduce old records. A return to the old installation
requires a deliberate manual recovery after backing up any new records. Normal
code rollback becomes available after the next managed update. Failed bootstrap
artifacts are retained and must be inspected before another `fresh` attempt.

Fresh bootstrap supports only local PostgreSQL on port 5432 with the `postgres`
OS administrator account; it refuses an external database or an already managed
installation. It never runs `DROP DATABASE`, `--force-reset` or `--accept-data-loss`.

## First Data-Preserving Deployment

From the repository on your Mac, after committing and running tests:

```bash
npm run deploy -- check
npm run deploy -- deploy --schema push
```

The wrapper `bash scripts/deploy.sh` accepts the same arguments. The first command
is read-only. The second prompts you to type `deploy` before changing anything.
Use `--yes` only when deliberately approving a noninteractive run.

This repository currently has no committed migration history. `--schema push`
applies the Prisma schema without `--accept-data-loss` or reset flags; inspect any
warning/failure instead of forcing it. The default `--schema check` refuses schema
drift. Once reviewed migration files exist, use `--schema migrate` instead.

## Future Updates

Commit your changes, then:

```bash
npm run deploy -- deploy
```

This builds a new clean release of `HEAD`. To deploy a particular committed branch
or tag, add `--ref your-branch-or-tag`. For an intentional schema change, choose
`--schema push` or `--schema migrate` explicitly. Nothing is fetched from GitHub
and no server checkout is pulled, so local server edits cannot block updates.

Useful options: `--host root@hostname`, `--port 22`, `--domain hostname`.
The service name, app port and directory layout are intentionally specific to this
application. This is not a general-purpose operating-system provisioning tool.

## What The Runner Does

1. Checks the existing service, app account, configuration, disk space and Nginx.
2. Transfers a checksummed source archive plus a root-only deployment runner.
3. Starts a systemd-owned deployment job. Closing your Mac/losing SSH does not kill
   the server job. A lock rejects simultaneous deploy/rollback operations.
4. Extracts into a new release, installs with `npm ci --include=dev`, generates the
   Prisma client and builds as the non-root app user while the old app stays up.
5. Stops the app for a maintenance window. It makes a PostgreSQL custom-format
   backup, verifies its archive listing, and archives source, environment and uploads
   in a root-only backup directory. A backup failure stops the update and restarts
   the previous app. Other independent database writers must also be paused by the
   operator; this script only controls this application service.
   Database tools also run as the app user; protected backup files are opened by
   the runner, and credentials travel over stdin rather than shell arguments or
   the privileged process environment.
6. Applies/checks the schema, links persistent configuration/uploads, and switches
   the active release through a small systemd override. Nginx/certificates are not
   rewritten. The app listens only on `127.0.0.1:3000`.
7. Checks the live database plus the exact release identity, both directly and
   through the HTTPS Nginx virtual host with certificate verification enabled.
8. If activation fails, restores the previous application configuration and checks
   it. Database changes are NOT automatically reversed. Failed releases and backups
   are retained for diagnosis. Successful incoming transfer directories are removed.

Expect a brief interruption during backup, schema application and restart. This
deliberately favors safe, consistent data handling over a zero-downtime claim.
There is no automatic rollback across a machine crash or forced termination;
inspect service/job state and backups before intervening or rerunning.

## Server Layout And Settings

```text
/opt/reebok-house-manager/                  original checkout retained as first fallback
/opt/reebok-house-manager-deploy/current    active release symlink
/opt/reebok-house-manager-deploy/releases/  independently built releases
/opt/reebok-house-manager-deploy/shared/.env.production
/opt/reebok-house-manager-deploy/shared/uploads/
/opt/reebok-house-manager-deploy/backups/   root-only backups and rollback metadata
```

On the first data-preserving switch, the legacy environment/upload paths become
links to shared storage too. This prevents a rollback from losing newer uploads.
Original copies are retained in that deployment's protected backup directory.
For `fresh`, legacy settings/uploads stay isolated and are never linked to the
new database's storage, including on later updates.

After deploying, edit the shared environment file on the server and restart:

```bash
sudo systemctl restart reebok-house-manager
```

Do not run the old `update-ubuntu.sh` or installer over a managed deployment; use
the Mac-side command. They expect the old checkout layout and may overwrite state.
Telegram activation remains a separate opt-in step in `TELEGRAM.md`.

## Status, Logs And Rollback

```bash
npm run deploy -- status
ssh root@reebok.williamson.co.za 'journalctl -u reebok-house-manager -n 100 --no-pager'
```

Each deployment prints its own job name. Inspect that job if the Mac disconnects:

```bash
ssh root@reebok.williamson.co.za 'journalctl -u JOB_NAME --no-pager'
```

To return to the previous application release:

```bash
npm run deploy -- rollback
```

Confirm that the previous code is compatible with the current database first.
Use additive/backward-compatible schema changes for routine deployments. The tool
does not assume that rolling code back reverses a migration. It backs up current
data before code rollback and never runs `pg_restore` against a live database.

Backups stay on this server: arrange a separate encrypted off-server copy. A valid
`pg_restore --list` is not a restore rehearsal. Periodically test recovery into a
separate database. Releases/backups are deliberately not automatically pruned;
monitor disk usage and retain at least the active/previous releases and useful
backups. Never remove `shared` or a release referenced by rollback metadata.
A `complete.json` marker identifies a backup whose steps all finished; a failed
attempt can leave partial files in another backup directory.

## Verification

```bash
npm run test:deploy
npm run lint
npm test
npm run test:integration
```

Deployment unit tests cover SSH quoting, archive exclusions, fresh-database isolation,
secret replacement, environment parsing, backup ordering and rollback failures.
Integration tests build the app and check health plus fresh-admin creation/login
against a disposable Docker PostgreSQL database.
The real host preflight is read-only. No production cutover, database restore,
or operating-system reinstall has been performed by these tests.
