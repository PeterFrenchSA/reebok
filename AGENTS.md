# AGENTS.md

## Project

Reebok House Manager is a `Next.js 15` App Router application with `Prisma` and `PostgreSQL`.

Primary domains in this repo:

- public and member/admin booking workflows
- role-based portals for guests, members, and admins
- finance, fees, expenses, and payment tracking
- assets and maintenance workflows
- decision voting
- invitation and account administration
- email template management
- model-free Telegram availability and account linking

## Main Stack

- `next`
- `react`
- `typescript`
- `prisma`
- `postgresql`
- `zod`

## Important Directories

- `src/app`
  - App Router pages and API routes
- `src/components`
  - client and server UI components
- `src/lib`
  - auth, RBAC, booking, mail, and utility logic
- `prisma`
  - schema and seed data
- `public/uploads`
  - uploaded files currently served publicly

## Role Model

Roles:

- `SUPER_ADMIN`
- `ADMIN`
- `SHAREHOLDER`
- `FAMILY_MEMBER`
- `GUEST`

Current intent:

- `SUPER_ADMIN` and explicitly appointed `ADMIN` accounts are admin-capable roles
- `SHAREHOLDER` has member capabilities plus full read-only financial visibility and exports, not imports or editing
- `FAMILY_MEMBER` has member capabilities
- `GUEST` is restricted to guest-facing flows only

Permission checks are centralized in `src/lib/rbac.ts`.

Do not bypass RBAC in UI or API code.

## Security Guardrails

These are important and should be preserved unless there is a deliberate redesign:

1. Auth impersonation headers
- `x-user-id` and related dev auth headers are for local development only.
- Do not allow them in production.
- See `src/lib/auth.ts`.

2. Session secret
- Production must use a real `SESSION_SECRET`.
- Do not reintroduce placeholder fallback behavior in production.

3. Booking management access
- Authenticated users may manage a booking only if they are the owner or have admin permission.
- Anonymous reference/email lookup requests an emailed private link; it must never authorize reading or editing by itself.
- Booking manage tokens are stored hashed at rest; legacy plaintext tokens may still appear during rollout and should remain temporarily compatible.
- Token checks must remain timing-safe.
- See:
  - `src/app/api/bookings/manage/route.ts`
  - `src/lib/booking-manage.ts`
  - `src/lib/tokens.ts`

4. Booking visibility
- Guests must not receive shared house booking data.
- Non-admin members may see shared booking summaries, but not private audit/requester detail.
- Keep non-admin booking payloads redacted.
- See:
  - `src/app/api/bookings/route.ts`
  - `src/components/ActiveBookingsPanel.tsx`

5. Super-admin protection
- Only super-admins may create or manage `SUPER_ADMIN` accounts.
- See:
  - `src/app/api/users/route.ts`
  - `src/components/AdminUserManager.tsx`

6. Upload safety
- Files uploaded through the app are currently public.
- Only safe document/image types should be accepted unless file delivery is redesigned.
- Root-relative URLs such as `/uploads/...` are valid and used by finance/maintenance flows.
- See:
  - `src/app/api/uploads/route.ts`
  - `src/app/api/payments/route.ts`
  - `src/app/api/expenses/route.ts`
  - `src/app/api/assets/route.ts`
  - `src/app/api/maintenance/tasks/route.ts`

7. Cron protection
- Scheduled job routes must require `CRON_SECRET` in production.
- See `src/app/api/jobs/subscription-reminders/route.ts`.

8. Invitation token handling
- Invitation tokens are stored hashed at rest.
- Rejected invitations should rotate to a fresh token before emailing a new registration link.
- The accept flow currently supports legacy plaintext invitation tokens for compatibility with older data.
- See:
  - `src/app/api/invitations/route.ts`
  - `src/app/api/invitations/accept/route.ts`
  - `src/app/api/invitations/[id]/review/route.ts`
  - `src/lib/tokens.ts`

9. Request throttling
- Keep public/auth/token-heavy routes rate limited.
- The current limiter is process-local and suitable as a lightweight guard, not a distributed abuse-prevention layer.
- See `src/lib/rate-limit.ts`.

10. Availability and Telegram
- Pending and approved bookings both block their accommodation; room bookings may overlap only in different rooms.
- All availability-changing writes must use `withBookingLock` and the shared reservation checks in `src/lib/availability.ts`, including imports.
- Telegram is read-only availability, without an AI model or booking mutations.
- Verify the webhook secret, link active member/admin accounts through hashed single-use tokens, and recheck permissions on each update and before protected delivery.
- Approved groups offer a private-chat handoff, never shared booking details.
- See `docs/TELEGRAM.md` for configuration and rollout requirements.

## Local Development

Typical commands:

```bash
npm install
npx prisma generate
npx prisma db push
SEED_DEMO_USERS=true npm run prisma:seed
npm run dev
```

Production-style validation:

```bash
npm run lint
npm run build
```

If Prisma schema changes:

```bash
npx prisma generate
npx prisma db push
```

## Environment Variables

Important env vars:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET`
- `APP_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `APPROVER_EMAILS`
- `ALLOW_DEV_AUTH_HEADERS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `SEED_DEMO_USERS`

Rules:

- `ALLOW_DEV_AUTH_HEADERS` should stay `false` outside local development.
- `SESSION_SECRET` must be real in production.
- `CRON_SECRET` should be set in production.

## Seed Accounts

Local seed accounts are useful for smoke testing:

- `admin@sandeney.co.za` / `admin1234`
- `member@sandeney.co.za` / `member1234`

Treat these as local-only defaults. Demo accounts are created only with
`SEED_DEMO_USERS=true` outside production mode; never enable this on a server.
Existing seeded accounts are not removed by the guard and must have their passwords changed.

## Expected Verification Before Handoff

At minimum:

```bash
npm run lint
npm run build
npm test
npm run test:integration
npm run test:deploy
```

When touching access control, bookings, invitations, or finance flows, also verify the related HTTP routes or UI flows locally.
Integration tests require Docker and use a disposable, loopback-only database;
never substitute a real database. See `scripts/test-integration.sh`.

Recommended smoke-test areas:

- login and role redirects
- guest/member/admin booking access rules
- booking create/approve/reject/manage
- invitation accept/review
- upload + linked document workflows
- expenses/assets/maintenance
- decisions and voting

## Current Gaps Worth Keeping In Mind

These are known follow-up areas, not reasons to block normal feature work:

- Dependency advisories and wider finance/maintenance/deployment findings remain documented in `docs/REVIEW-2026-09-20.md`; do not assume this Telegram change resolves them
- current rate limiting is in-memory and should be replaced with a shared store if the app runs across multiple instances
- `next lint` is deprecated and should be migrated to ESLint CLI before Next 16
- automated tests cover the new booking/access/Telegram paths, not every legacy workflow or live external delivery

## Guidance For Future Agents

- Prefer changing API and UI together when role visibility is involved.
- Preserve existing route shapes unless there is a strong reason to change them.
- Avoid exposing private booking/user detail to the wrong role even if the current UI does not render it.
- If you add new uploaded file flows, reuse the existing root-relative document URL convention.
- If you add new privileged actions, add or reuse explicit RBAC permissions instead of role-checking inline everywhere.

## Deployment

- Current production uses Coolify on `headless.webxpoint0.com`, repository branch
  `main`, and the root Dockerfile. Follow `docs/COOLIFY.md`; keep credentials in
  Coolify runtime settings and preserve the PostgreSQL and uploads volumes.
- The SSH deployment commands below target the older standalone installation.
  Do not use them to update the current Coolify deployment.

- `npm run deploy -- check` is a read-only SSH preflight for the existing Ubuntu host.
- `check-fresh` is the read-only bootstrap preflight; explicitly approved `fresh` creates a separate empty database only after backing up the old installation. Never erase the old database or bypass the fresh-install identity checks.
- Fresh bootstrap generates strong server-side session/cron secrets and one explicitly named super-admin; credentials stay in the protected backup, never in source or logs. Legacy data/storage remain isolated, including on future updates.
- Deploy from a clean committed checkout using `npm run deploy -- deploy`; use an explicit schema mode for database changes.
- The managed runner uses non-root app builds, protected backups, shared settings/uploads and a brief stopped-app maintenance window.
- Application rollback never automatically restores the database. Never add forced schema reset/data-loss flags or overwrite secrets from a local environment file.
- See `docs/DEPLOYMENT.md`; do not run the legacy installer/updater over managed releases.
