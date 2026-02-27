# Reebok House Manager (Iteration 1)

Next.js + PostgreSQL starter platform for managing Sandeney Pty Ltd's family beach house operations.

## What This Iteration Implements

- Invite-only user model with roles:
  - `SHAREHOLDER` (super-admin capabilities)
  - `SUPER_ADMIN`
  - `FAMILY_MEMBER` (booking only)
  - `GUEST` (public booking only)
- Mandatory approval flow for all bookings
- Admin booking approvals panel in `/admin`
- External bookings constrained to whole-house reservations
- Family bookings support whole-house or optional room allocations
- Fee engine reflecting your proposal defaults:
  - R100 monthly subscription
  - Member/dependent/guest/mere-family/external rate tiers
  - Seasonal rate overrides for external visitors
- Arrears tracking with reminder capability (no suspension)
- Admin/member fee tracking panels (`/admin` and `/member`)
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

Sample seeded accounts (after `npm run prisma:seed`):

- Admin: `admin@sandeney.co.za` / `admin1234`
- Member: `member@sandeney.co.za` / `member1234`

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
- `POST /api/bookings/{id}/approve`
- `POST /api/bookings/{id}/reject`
- `GET|POST /api/rooms`
- `GET|POST /api/invitations`
- `POST /api/invitations/accept`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET|PATCH /api/users` (admin user management)
- `GET|POST /api/payments`
- `GET|POST|PATCH /api/subscriptions`
- `POST /api/fees/calculate`
- `GET|POST|PATCH /api/fees/config`
- `GET|POST /api/expenses`
- `GET /api/finance/export?entity=expenses&format=csv`
- `POST /api/finance/import`
- `GET|POST /api/maintenance/tasks`
- `GET|POST /api/assets`
- `GET|POST /api/feedback`
- `POST /api/ocr/invoice`
- `POST /api/jobs/subscription-reminders`
- `GET|POST /api/channels/sync`

## Authentication Note

This iteration now includes simple credential login with an HTTP-only cookie session (`/api/auth/login`).
Header-based fallback (`x-user-id`, `x-user-role`) still works for integration testing, but production should
move to full invitation acceptance and hardened auth/session flows.

## Payment Gateway Note

Gateway records are modeled now. The next iteration should add full checkout and webhook handlers for:
- Yoco
- Ozow
- Optional additional provider depending on Capitec/South African EFT flow requirements

## OCR Note

`POST /api/ocr/invoice` uses OpenAI Responses API with image input and JSON schema extraction.
You can save extracted data directly as an `Expense` row.
