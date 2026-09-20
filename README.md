# Reebok House Manager

Next.js + PostgreSQL starter platform for managing Sandeney Pty Ltd's family beach house operations.

## What This Iteration Implements

- Invite-only user model with roles:
  - `SUPER_ADMIN`
  - `ADMIN` (appointed administrators)
  - `SHAREHOLDER` (member access plus read-only financial records and exports)
  - `FAMILY_MEMBER` (bookings, maintenance requests and eligible votes)
  - `GUEST` (public booking only)
- Mandatory approval flow for all bookings
- Admin booking approvals panel in `/admin`
- External bookings constrained to whole-house reservations
- Family bookings support whole-house or optional room allocations
- Pending and confirmed bookings hold the relevant rooms; conflicting writes are serialized
- Telegram availability with secure account linking, room/date buttons and approved-group private-chat handoff (no AI model)
- Fee engine reflecting your proposal defaults:
  - R100 monthly subscription
  - Member/dependent/guest/mere-family/external rate tiers
  - Seasonal rate overrides for external visitors
- Arrears tracking with reminder capability (no suspension)
- Admin/member fee tracking panels (`/admin` and `/member`)
- Admin expenses ledger UI with CSV/XLSX import/export
- Assets and maintenance workflow UI for admin + members
- Admin feedback moderation UI
- Admin-editable guest useful-info bulletin board
- Active bookings queue on admin/member pages with audit trails
- Decision voting workflow:
  - Admin-created polls (`admins only` or `members + admins`)
  - Member-submitted decisions for admin review/launch
  - Vote tracking visuals (turnout, yes/no/abstain) by eligible audience
- Payment records with manual proof support and multi-month coverage
- Gateway-ready payment fields (Yoco, Ozow, extensible)
- Expense and finance records import/export (CSV/XLSX)
- Asset + maintenance task tracking
- Public and internal feedback sections
- Invoice OCR extraction endpoint via OpenAI API
- Booking.com/Airbnb integration scaffold for calendar-first sync

## Tech Stack

- Next.js (App Router, TypeScript)
- PostgreSQL
- Prisma ORM
- Zod validation
- CSV/XLSX utilities
- Nodemailer for transactional email

## Project Structure

- `prisma/schema.prisma`: database model
- `src/app/api/*`: API endpoints
- `src/lib/*`: auth, RBAC, fees, mail, import/export, OCR
- `src/app/page.tsx`: booking landing page
- `src/app/admin`: admin section
- `src/app/member`: member section
- `src/app/guest`: guest booking + feedback section
- `src/app/login`: credential sign-in page

## Setup

1. Install Node.js 20+ and npm.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment file:
   ```bash
   cp .env.example .env
   ```
4. Set `DATABASE_URL` and `SESSION_SECRET` in `.env`.
5. Generate Prisma client and migrate:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```
6. Seed baseline data:
   ```bash
   npm run prisma:seed
   ```
7. Run dev server:
   ```bash
   npm run dev
   ```

Local-only sample accounts (opt in with `SEED_DEMO_USERS=true npm run prisma:seed`, never on production):

- Admin: `admin@sandeney.co.za` / `admin1234`
- Member: `member@sandeney.co.za` / `member1234`

## Telegram And Role Rollout

See [Telegram setup and deployment](docs/TELEGRAM.md). This change introduces an
`ADMIN` role: shareholders no longer receive administrative permissions. Confirm a
working super-admin account before updating the schema, then appoint administrators
explicitly. Shareholders see financial records at `/member/finances`.

The bot checks availability only. Live activation requires a BotFather token and
the server's HTTPS webhook configuration. Bot booking and WhatsApp are later phases.

## Automated Checks

```bash
npm test
npm run lint
npm run test:integration
```

The integration runner requires Docker, builds the app and uses an isolated test
database. It never sends real Telegram messages or email. Wider review findings
and remaining work are recorded in [the dated review](docs/REVIEW-2026-09-20.md).

## Ubuntu 24.04 VPS Deploy

Use the install script:

```bash
cd /path/to/reebok-house-manager
sudo bash scripts/install-ubuntu-24.04.sh --domain house.example.com --email admin@example.com
```

If you want HTTP only first:

```bash
sudo bash scripts/install-ubuntu-24.04.sh --skip-tls
```

Useful options:

- `--app-dir /opt/reebok-house-manager`
- `--app-user ubuntu`
- `--db-name reebok_house`
- `--db-user reebok_app`
- `--db-password '<strong-password>'`
- `--port 3000`

### First Production Administrator

Production seeding does not create sample logins. On a fresh installation only,
create the first super-admin from the application directory with a unique email
and a password of at least 16 characters. These prompts keep the password out of
shell history; do not add the bootstrap variables permanently to the environment file.

```bash
read -rp 'Admin email: ' BOOTSTRAP_ADMIN_EMAIL
read -rsp 'Admin password (16+ characters): ' BOOTSTRAP_ADMIN_PASSWORD; echo
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
node --env-file=.env.production --import tsx scripts/create-admin.ts
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

The script refuses to overwrite accounts or run when a working super-admin exists.
Existing installations should use User Administration, not bootstrap or demo seeding.

## Zero-Downtime Updates (Ubuntu 24.04)

Use the update script:

```bash
cd /path/to/reebok-house-manager
sudo bash scripts/update-ubuntu.sh
```

With git pull:

```bash
sudo bash scripts/update-ubuntu.sh --git-pull --git-branch main
```

Skip seed if needed:

```bash
sudo bash scripts/update-ubuntu.sh --git-pull --git-branch main --skip-seed
```

How it works:

- Builds a staged release in `/tmp`
- Starts temporary app instance on port `3001`
- Switches Nginx traffic to temporary instance
- Updates primary app and restarts systemd service on port `3000`
- Switches traffic back and removes temporary instance
- Preserves uploaded support files in `public/uploads`

## Cleanup and Reinstall (Ubuntu 24.04)

If installation got into a bad state, run cleanup:

```bash
cd /path/to/reebok-house-manager
sudo bash scripts/cleanup-ubuntu-24.04.sh --yes
```

If you also want to remove the full app directory:

```bash
sudo bash scripts/cleanup-ubuntu-24.04.sh --remove-app-dir --yes
```

Then reinstall:

```bash
sudo bash scripts/install-ubuntu-24.04.sh --skip-tls
```

## Key API Endpoints

- `POST /api/bookings`
- `GET /api/v1/availability?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` (member session required; repeat `roomId` for room selection)
- `GET|POST|DELETE /api/telegram/link`
- `GET|POST /api/admin/telegram`
- `POST /api/telegram/webhook` (Telegram secret header required)
- `POST /api/bookings/{id}/approve`
- `POST /api/bookings/{id}/reject`
- `POST /api/bookings/{id}/comment`
- `GET|POST /api/rooms`
- `GET|POST /api/invitations`
- `POST /api/invitations/accept`
- `POST /api/invitations/{id}/review` (admin approve/reject of invite registrations)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET|POST|PATCH /api/users` (admin user management and direct account creation)
- `GET|POST /api/payments`
- `GET|POST|PATCH /api/subscriptions`
- `POST /api/fees/calculate`
- `GET|POST|PATCH /api/fees/config`
- `GET|POST /api/expenses`
- `GET /api/finance/export?entity=expenses&format=csv`
- `POST /api/finance/import`
- `GET|POST|PATCH /api/maintenance/tasks`
- `GET|POST|PATCH /api/assets`
- `GET|POST|PATCH /api/feedback`
- `POST /api/uploads`
- `GET|POST /api/decisions`
- `PATCH /api/decisions/{id}` (launch/close/reject)
- `POST /api/decisions/{id}/vote`
- `POST /api/ocr/invoice`
- `POST /api/jobs/subscription-reminders`
- `GET|POST /api/channels/sync`

## Authentication Note

This iteration now includes simple credential login with an HTTP-only cookie session (`/api/auth/login`).
Header-based fallback (`x-user-id`, `x-user-role`) is now development-only and must be explicitly enabled with
`ALLOW_DEV_AUTH_HEADERS=true`. Production should rely on normal login/session flows with a strong `SESSION_SECRET`.

## Security Notes

- Set `SESSION_SECRET` to a strong non-placeholder value in production.
- Set `CRON_SECRET` in production before calling `POST /api/jobs/subscription-reminders`.
- Uploaded support files are intentionally limited to common document and image types because they are served from `public/uploads`.

## Payment Gateway Note

Gateway records are modeled now. The next iteration should add full checkout and webhook handlers for:
- Yoco
- Ozow
- Optional additional provider depending on Capitec/South African EFT flow requirements

## OCR Note

`POST /api/ocr/invoice` uses OpenAI Responses API with image input and JSON schema extraction.
You can save extracted data directly as an `Expense` row.
