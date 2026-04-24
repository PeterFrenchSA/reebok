# Merge Summary

## Branch

- Source branch: `codex/reebok-audit-hardening`

## Commits

1. `e26725f` `chore: add lint baseline and security env docs`
2. `7622a55` `fix: harden auth jobs uploads and role controls`
3. `43483f3` `fix: tighten booking access and protect booking tokens`
4. `a976cd0` `fix: hash invitation tokens with legacy compatibility`
5. Latest review commit `fix: harden public routes and finance imports`

## What This Branch Adds

- non-interactive lint baseline for the repo
- production auth/session hardening
- protected cron reminder route behavior
- safer upload type restrictions
- safer admin user role controls for `SUPER_ADMIN`
- guest/member/admin booking visibility corrections
- fix for logged-in non-owners managing bookings by `reference + email`
- hashed booking manage tokens at rest
- hashed invitation tokens at rest
- legacy plaintext invitation token compatibility during rollout
- root-relative payment proof URL support
- lightweight rate limiting for login, booking create/manage, invitation accept, feedback, and non-admin payment submission
- safer booking approval/rejection API response payloads
- stricter non-admin payment creation rules
- more defensive finance import parsing and actual imported/skipped counts
- patched dependency baselines for Next.js, Prisma, and Nodemailer
- replacement of the high-severity `xlsx` dependency with an ExcelJS-backed workbook helper
- audit report and repo agent guidance

## Validation Completed

- `npm run lint`
- `npm run build`
- `npm audit --audit-level=high`
- live smoke test coverage for:
  - auth and role redirects
  - booking creation and approval
  - guest/member/admin booking access rules
  - booking management access restrictions
  - expenses, exports, imports, subscriptions, and payments
  - assets and maintenance
  - decisions and voting
  - feedback moderation
  - invitation create, accept, and approval flows
- focused token verification for:
  - hashed booking manage token storage
  - hashed invitation token storage
  - rejecting copied hashed invitation values as input
  - accepting legacy plaintext invitation tokens during transition

## Rollout Notes

- No Prisma schema change is required for these hardening updates.
- Booking manage tokens and invitation tokens now store hashed values in the existing columns.
- Legacy plaintext invitation tokens are still accepted so older records do not break immediately.
- Booking manage email fallback is now anonymous-only by design.
- High-severity `npm audit` now passes; full audit still reports low-severity ExcelJS transitive advisories in `fast-csv`/`tmp`.
- Production should set:
  - `SESSION_SECRET`
  - `CRON_SECRET`

## Remaining Follow-Ups

1. Monitor or replace ExcelJS if a clean non-breaking path appears for its low-severity transitive advisories.
2. Consider moving private documents off public file serving.
3. Move rate limiting to Redis/Postgres/proxy-level storage if running multiple app instances.
4. Migrate from deprecated `next lint` to ESLint CLI before Next 16.
5. Add committed integration tests for critical role and booking flows.

## Supporting Docs

- [skills.md](/Users/peterfrench/Documents/Codex%20Projects/Reebok/reebok-house-manager/skills.md)
- [AGENTS.md](/Users/peterfrench/Documents/Codex%20Projects/Reebok/reebok-house-manager/AGENTS.md)
