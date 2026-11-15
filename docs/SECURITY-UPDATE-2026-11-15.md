# Nodemailer security update, 15 November 2026

## Scoped fix

- Pin Nodemailer to `10.5.0` from installed `9.1.1`. Regenerate the lockfile and
  remove `@types/nodemailer`; version 10 includes its own declarations.
- The two reported address-parser denial-of-service issues are fixed by 10.0.5
  and 10.0.6 respectively; 10.5.0 includes both fixes and later maintenance fixes.
- Nodemailer 10 requires Node >=20. The existing production Dockerfile uses
  Node 22.23.4. The app uses supported `createTransport` / `sendMail` SMTP APIs.
- Test SMTP configuration, recipient arrays, multipart mail, error propagation,
  and the advisory parser inputs locally, without sending any external email.
- This release also includes the reviewed 10-night member/family cap and updated
  role tutorials. Guest stays retain 90 nights. No database migration is needed.

Primary references:

- [Comment-joined address parsing](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-prgh-xp8r-p3m5)
- [Free-text fallback parsing](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j)
- [Nodemailer changelog and Node requirement](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md)

## Remaining audit scope

`npm audit` after this scoped update reports no Nodemailer entry, but still lists
16 vulnerable dependency nodes (7 high, 9 moderate, 0 critical), including inherited
parent-package entries. This is not a count of distinct exploitable app defects.
Outstanding areas include Zod/OpenAI, Prisma/deepmerge-ts, PostCSS/source-map-js,
ESLint tooling and ExcelJS/uuid. Some suggested fixes require major migrations or
even a downgrade. Do not run `npm audit fix --force` against production.

These need separate reachability review and tested upgrades. The Docker image
currently includes build/development dependencies for pinned operational tooling,
so an installed-package scan may still flag those dependencies. Fixing the two
Coolify Nodemailer findings is not a claim that the whole application is
vulnerability-free.

## Deployment checks

Use the existing Coolify application, not the old standalone deploy scripts.
Back up the database and uploads on the server only, preserve runtime secrets and
volumes, and deploy a committed main-branch release. Confirm the running image's
Nodemailer version, release identity, public health endpoint and portal access
boundaries. Do not send test messages to real users or submit production bookings.
SMTP composition tests do not prove external inbox delivery.
