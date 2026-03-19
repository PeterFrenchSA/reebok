# Audit Report

## Scope

- Workspace audited: `reebok-house-manager`
- Working branch: `codex/reebok-audit-hardening`
- Audit date: 2026-03-17
- Note: the audit applies to the Reebok House Manager application in this repository.

## Outcome

- `npm run build`: passing
- `npm run lint`: passing
- Live smoke testing: passing for the main role, booking, finance, maintenance, decision, feedback, template, and invitation flows against a local build and temporary Postgres instance

## High-Impact Fixes Applied

1. Production auth hardening
- Disabled header-based auth impersonation outside explicit local development use.
- Enforced a real `SESSION_SECRET` in production.
- Files:
  - `src/lib/auth.ts`
  - `.env.example`
  - `README.md`

2. Booking manage token comparison hardening
- Replaced plain token comparison with `timingSafeEqual`.
- Added hashing for booking manage tokens at rest, while preserving legacy plaintext token compatibility during rollout.
- File:
  - `src/lib/booking-manage.ts`
  - `src/lib/tokens.ts`

3. Cron route hardening
- Prevented the reminder job route from becoming callable in production when `CRON_SECRET` is unset.
- File:
  - `src/app/api/jobs/subscription-reminders/route.ts`

4. Upload safety controls
- Restricted uploads to safe document and image types to reduce XSS risk from files served under `public/uploads`.
- File:
  - `src/app/api/uploads/route.ts`

5. Super-admin privilege protection
- Prevented non-super-admin users from creating or managing `SUPER_ADMIN` accounts.
- Files:
  - `src/app/api/users/route.ts`
  - `src/components/AdminUserManager.tsx`

6. Booking privacy and access-control fixes
- Fixed a booking-management vulnerability where a logged-in non-owner could use `reference + email` to access another booking.
- Restricted email-only booking lookup to anonymous public flows.
- Redacted shared booking payloads for non-admin members.
- Prevented guests from seeing shared house booking records through the bookings API.
- Hid admin-only booking details in the non-admin active-bookings UI.
- Files:
  - `src/app/api/bookings/manage/route.ts`
  - `src/app/api/bookings/route.ts`
  - `src/components/ActiveBookingsPanel.tsx`

7. Payment proof upload compatibility
- Allowed root-relative uploaded document URLs in the payments API so app uploads can be attached to payment records.
- File:
  - `src/app/api/payments/route.ts`

8. Invitation token protection
- Invitation tokens are now stored hashed at rest.
- Rejected invitations rotate to a fresh token before sending the resubmission link.
- The accept flow still supports legacy plaintext invitation tokens already present in the database.
- Files:
  - `src/app/api/invitations/route.ts`
  - `src/app/api/invitations/accept/route.ts`
  - `src/app/api/invitations/[id]/review/route.ts`
  - `src/lib/tokens.ts`

9. Linting baseline
- Added an ESLint config so lint can run non-interactively in this repository.
- Files:
  - `.eslintrc.json`
  - `package-lock.json`

## Live Feature Validation

The following paths were validated against a built local app instance:

- Authentication and roles
  - admin login
  - member login
  - guest login
  - admin user creation

- Booking flows
  - public booking creation
  - admin booking approval
  - anonymous booking management by reference + email
  - member blocked from managing another user's booking by reference + email
  - guest booking creation
  - guest bookings list limited to own bookings
  - member shared-booking payload verified as redacted summary data

- Admin communication tools
  - email template list
  - email template update

- File handling
  - authenticated upload of allowed document type

- Finance
  - expense creation
  - expense listing
  - finance CSV export
  - finance XLSX export
  - finance CSV import
  - subscription upsert
  - payment creation with uploaded proof URL

- Assets and maintenance
  - asset creation
  - asset listing
  - member maintenance task creation
  - admin maintenance task update

- Decisions
  - admin decision creation
  - member vote submission

- Feedback
  - public feedback creation
  - admin moderation update

- Invitations
  - invitation creation
  - invitation acceptance
  - admin approval review

## Important Findings Still Worth Addressing

1. Rate limiting
- Login, booking-manage lookup, invitations, and feedback endpoints do not currently appear to have request throttling.
- Recommendation: add per-IP and per-account rate limiting for auth and token-based flows.

2. Public file exposure model
- Uploaded files are still served from a public path.
- Current mitigation is file-type restriction, which is a good improvement, but private finance or maintenance documents may eventually need authenticated download routes instead of public URLs.

3. `next lint` deprecation
- Lint passes today, but the script still uses deprecated `next lint`.
- Recommendation: migrate to the ESLint CLI before upgrading to Next.js 16.

4. Automated regression coverage
- The repo does not yet have an automated integration test suite for role boundaries and key workflows.
- Recommendation: add API-level integration tests for:
  - auth/session rules
  - booking visibility and management
  - invitation lifecycle
  - finance import/export
  - maintenance approval workflow

## Files Touched In This Audit Branch

- `.env.example`
- `.eslintrc.json`
- `README.md`
- `next-env.d.ts`
- `package-lock.json`
- `src/app/api/bookings/manage/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/jobs/subscription-reminders/route.ts`
- `src/app/api/payments/route.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/users/route.ts`
- `src/components/ActiveBookingsPanel.tsx`
- `src/components/AdminUserManager.tsx`
- `src/lib/auth.ts`
- `src/lib/booking-manage.ts`
- `src/lib/tokens.ts`

## Ready State

This branch is in a good state for review and merge preparation. The main security and access-control gaps found during the audit have been addressed, and the primary user-facing features exercised in the live smoke test pass are working.
