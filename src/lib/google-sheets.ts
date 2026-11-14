import { JWT } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildSheetsBatch, GoogleSheet, ReportTab, retryAfterMs, SheetsError } from "@/lib/sheets-report";
import { sheetsSnapshot } from "@/lib/sheets-snapshot";

export const SHEETS_SYNC_ID = "house";
export const SHEETS_INTERVAL_MS = 5 * 60000;
export function sheetsCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return { email: email && /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email) ? email : null,
    configured: Boolean(email && /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email) && key?.includes("-----BEGIN PRIVATE KEY-----")) };
}
export interface SheetsTransport {
  read(id: string): Promise<GoogleSheet[]>;
  write(id: string, batch: ReturnType<typeof buildSheetsBatch>): Promise<void>;
}
function googleTransport(): SheetsTransport {
  const credentials = sheetsCredentials();
  if (!credentials.configured || !credentials.email) throw new SheetsError("Google credentials are not configured. Ask the operator to add the service-account settings in Coolify.", 503);
  const auth = new JWT({ email: credentials.email, key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"], transporterOptions: { timeout: 15000, retry: false } });
  return {
    async read(id) {
      const response = await auth.request<{ sheets?: GoogleSheet[] }>({ url: `https://sheets.googleapis.com/v4/spreadsheets/${id}`, params: { fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),developerMetadata(metadataKey,metadataValue))" }, timeout: 20000, retry: false });
      return response.data.sheets ?? [];
    },
    async write(id, data) {
      await auth.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, method: "POST", data, timeout: 60000, retry: false });
    }
  };
}
function safeSyncError(error: unknown) {
  if (error instanceof SheetsError) return error.message;
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403 || status === 404) return "Google denied access. Check the spreadsheet link, share it with the displayed service-account email as Editor, and enable the Sheets API.";
  if (status === 401) return "Google authentication failed. Ask the operator to check or rotate the service-account credentials.";
  if (status === 429) return "Google rate limit reached. The next scheduled run will retry automatically.";
  return "Sync could not be confirmed. Check Google access and connectivity, then retry. The previous successful snapshot remains the last verified report.";
}
export async function ensureSheetsState() {
  return prisma.googleSheetsSync.upsert({ where: { id: SHEETS_SYNC_ID }, create: { id: SHEETS_SYNC_ID }, update: {} });
}
// Dependencies are injectable only from server tests, never from an HTTP payload or environment URL.
export async function syncGoogleSheets(options: { manual?: boolean; transport?: SheetsTransport; snapshot?: () => Promise<ReportTab[]> } = {}) {
  const now = new Date();
  const state = await ensureSheetsState();
  if (!state.enabled || !state.spreadsheetId) return { skipped: "disabled" as const };
  if (!options.manual && state.nextAttemptAt && state.nextAttemptAt > now) return { skipped: "not-due" as const };
  const token = randomUUID();
  const acquired = await prisma.googleSheetsSync.updateMany({ where: {
    id: state.id, enabled: true, version: state.version, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    ...(options.manual ? {} : { AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] })
  }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 5 * 60000), lastAttemptAt: now } });
  if (!acquired.count) return { skipped: "busy" as const };
  try {
    const transport = options.transport ?? googleTransport();
    const tabs = await (options.snapshot ?? sheetsSnapshot)();
    const existing = await transport.read(state.spreadsheetId);
    const batch = buildSheetsBatch(tabs, existing);
    const stillOwned = await prisma.googleSheetsSync.count({ where: { id: state.id, enabled: true, version: state.version, leaseToken: token, leaseUntil: { gt: new Date(Date.now() + 90000) } } });
    if (!stillOwned) throw new SheetsError("Sync lease expired before delivery. Retry from the app.", 409);
    // A single atomic batch replaces only integration-owned tabs, including their stale rows.
    await transport.write(state.spreadsheetId, batch);
    const counts = Object.fromEntries(tabs.filter((tab) => tab.key !== "readme").map((tab) => [tab.key, tab.rows.length]));
    await prisma.googleSheetsSync.updateMany({ where: { id: state.id, leaseToken: token }, data: { lastSuccessAt: new Date(), failureCount: 0, lastError: null, lastRowCounts: counts,
      // Align to the next five-minute slot, rather than skipping a cron tick by a few seconds.
      nextAttemptAt: new Date((Math.floor(Date.now() / SHEETS_INTERVAL_MS) + 1) * SHEETS_INTERVAL_MS), leaseToken: null, leaseUntil: null } });
    return { synced: true as const, counts };
  } catch (error) {
    const message = safeSyncError(error);
    await prisma.googleSheetsSync.updateMany({ where: { id: state.id, leaseToken: token }, data: {
      failureCount: { increment: 1 }, lastError: message, nextAttemptAt: new Date(Date.now() + retryAfterMs(state.failureCount + 1)), leaseToken: null, leaseUntil: null
    } });
    throw new SheetsError(message, error instanceof SheetsError ? error.status : 502);
  }
}
