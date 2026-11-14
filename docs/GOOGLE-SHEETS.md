# Google Sheets reporting

The app remains the source of truth. This integration copies records **one way**
to one personally owned Google spreadsheet. It does not import sheet edits,
create a Google account, share a workbook automatically, or use an AI model.

## Workbook contents and privacy

The first successful sync creates five managed tabs:

| Tab | Contents |
| --- | --- |
| Reebok - Bookings | All statuses/history, member lead names, dates, room allocations, guest/pet totals and estimates |
| Reebok - Expenses | Ledger entries, category, supplier, invoice number, amounts and dates |
| Reebok - Payments | Recorded payment status, payer/subscription names, amounts, references and coverage |
| Reebok - Member Fees | Member subscriptions, recorded arrears and due/payment dates |
| Reebok - Readme | Snapshot timestamp, meaning, sharing and maintenance notes |

Guest stays are anonymous in the roster. Contact fields, management tokens,
internal booking notes, room guest labels, uploaded document links, OCR and
payment-gateway payloads are excluded. Free-text titles, suppliers and payment
references are still exported: do not place secrets in those fields.

**Anyone with workbook access can see its financial tabs.** App roles cannot
restrict a Google workbook. Share only with people entitled to these records,
preferably as Viewers. Hiding or protecting tabs is not a privacy boundary.
The owner controls all sharing in Google Drive; the app changes no sharing rules.
[Google explains protected-sheet limitations](https://support.google.com/docs/answer/1218656?hl=en).

Managed report cells are replaced on each successful sync. Keep manual notes,
formulas and analysis in **separate tabs**. Unrelated tabs are left untouched.
Existing unmarked tabs with reserved names cause an error, not an overwrite.
Rows are located by integration metadata, not just names. Do not duplicate
managed tabs with their metadata. Removing ownership metadata requires renaming
that old tab before a new report tab can be created.

## One-time setup

1. Sign in to the intended personal Gmail account and create a **blank Google
   spreadsheet**. Retain ownership. Do not paste passwords or private keys into it.
2. In a Google Cloud project under your control, enable the **Google Sheets API**,
   create a dedicated service account and generate its JSON key. No Google
   Workspace subscription or domain-wide delegation is required. The service
   account needs Editor access to this sheet, not broad project Editor access.
3. Put only the JSON key's `client_email` and `private_key` fields into the
   existing Coolify application's **runtime** environment variables:

   ```text
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account client_email>
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<complete PEM private_key>
   ```

   Use a real multiline PEM value or literal `\n` line separators. Keep the
   BEGIN/END lines. Do not make these build-time/public variables, commit the JSON
   key, paste it in chat, or upload it through the app. Store the downloaded key
   securely and delete unneeded copies. Rotate it if exposed. Redeploy/restart
   with the updated runtime environment, preserving database/uploads volumes.
4. Share your workbook with that service-account email as **Editor**. Share only
   the intended workbook with this dedicated account. Your family access is
   managed separately using normal Drive sharing.
5. In **Admin > Google Sheets**, paste its URL, enable sync, read and acknowledge
   the sharing/overwrite warning, and save. Run **Sync now**. Confirm all five
   tabs, record counts and the last-success timestamp. The credentials-present
   indicator alone does not prove Google access works.

The integration uses Google's maintained authentication library and Sheets scope,
not Gmail access. [Google's service-account guide](https://developers.google.com/identity/protocols/oauth2/service-account)
describes the server-to-server authentication model.

## Five-minute scheduled job

Set a strong `CRON_SECRET` in the existing app runtime settings. In that Coolify
application's **Scheduled Tasks**, create:

```text
Name: Reebok Google Sheets reporting
Command: node /app/scripts/sync-google-sheets.mjs
Frequency: */5 * * * *
Timeout: 240 seconds
```

Choose the application container if multiple containers are present. Do not put
`docker exec`, credentials or a public URL in the command. The included runner
calls the protected job endpoint over loopback, taking the secret from runtime
settings. The Dockerfile includes this script. Do not use a desktop automation.
Run **Execute now**, inspect the execution result, then check **Last scheduler
check-in** and **Last verified success** in Admin > Google Sheets. A scheduler
check-in alone does not prove a successful export. A normal successful run sets
its next due time to the next five-minute slot. Scheduler delays and retries can
make the report older; no instant consistency is promised.
[Coolify scheduled-task documentation](https://coolify.io/docs/applications/operations/scheduled-tasks)
explains task execution and history.

## Consistency, limits and recovery

- A repeatable-read database snapshot is exported; a booking made during a run
  appears on a later run. All history is included, never silently truncated.
- A database lease prevents concurrent app instances/manual jobs from writing
  over each other. Settings cannot change while a live lease exists. A crashed
  process's lease expires after five minutes; refresh status and retry.
- A single atomic Sheets `batchUpdate` replaces all managed tabs and clears old
  cells. Formula-looking text is written as literal text, not interpreted input.
  [Sheets batch semantics](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
  apply to the workbook update, not to a transaction with PostgreSQL.
- If delivery succeeds but its acknowledgement is lost, the app reports the run
  as unconfirmed. The next snapshot is safe to resend. Last success is the last
  **verified** report, not proof that an unconfirmed write did not occur.
- Retries use increasing delays of 5, 10, 20, 40, then 60 minutes, checked by the
  scheduled job. Manual sync can retry sooner (rate limited). An outage never
  blocks normal booking writes.
- A complete batch over 2 MB, an excessively long cell, or more than 50,000 rows
  in any source report fails before delivery. For a larger deployment, extend
  the export pipeline deliberately; do not drop history to hide the error.
- Missing access: verify the URL, Editor sharing, Sheets API enablement and key.
  Reserved-name collision: rename your existing unmarked tab. Stale scheduler:
  check the Coolify task, runtime secret and container status.
- Disable sync in the admin page to stop future copies; disabling is blocked
  until an active run finishes. Old Google data stays in the workbook. Revoke
  service-account sharing/key separately if necessary.
- This is a report, not a backup, payment gateway, bank reconciliation or a way
  to restore deleted app records. Keep the existing database/uploads backups.

## Additive rollout

This release adds the `GoogleSheetsSync` table for target configuration, version,
lease and sync health. Private keys are never stored there. Follow the reviewed
schema/backup procedure in `docs/COOLIFY.md`; never reset or seed production.
Local integration tests use a fake Google transport and disposable PostgreSQL.
They do not verify live account permissions or a real scheduled Google delivery.
