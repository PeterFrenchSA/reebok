import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { rejectForeignWrite } from "@/lib/write-origin";
import { ensureSheetsState, sheetsCredentials, SHEETS_SYNC_ID, syncGoogleSheets } from "@/lib/google-sheets";
import { SheetsError, spreadsheetIdFromInput, REPORT_TITLES } from "@/lib/sheets-report";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
async function authorized(req: NextRequest) {
  const user = await getSessionUser(req);
  return user && hasPermission(user.role, "integrations:manage") ? user : null;
}
export async function GET(req: NextRequest) {
  if (!await authorized(req)) return json({ error: "Integration administration permission required." }, 403);
  try {
    const state = await ensureSheetsState();
    const { leaseToken: _token, updatedById: _actor, ...safe } = state;
    return json({ state: safe, credentials: sheetsCredentials(), tabs: REPORT_TITLES });
  } catch { return json({ error: "Sync settings unavailable. Check that the additive database update has been applied." }, 503); }
}
const schema = z.object({ spreadsheet: z.string().trim().min(1).max(2000), enabled: z.boolean(), version: z.number().int().nonnegative(), acknowledgeSharing: z.boolean().default(false) }).strict();
export async function PUT(req: NextRequest) {
  const rejected = rejectForeignWrite(req); if (rejected) return rejected;
  const user = await authorized(req); if (!user) return json({ error: "Integration administration permission required." }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Provide a spreadsheet link, settings version and sharing acknowledgement." }, 400);
  try {
    const data = parsed.data;
    const id = spreadsheetIdFromInput(data.spreadsheet);
    if (data.enabled && !data.acknowledgeSharing) throw new SheetsError("Confirm that everyone with workbook access may see its financial data and that managed tabs will be replaced.");
    if (data.enabled && !sheetsCredentials().configured) throw new SheetsError("Save the link with sync disabled until Google credentials are configured.", 503);
    const current = await ensureSheetsState();
    const changedTarget = current.spreadsheetId !== id;
    const result = await prisma.googleSheetsSync.updateMany({ where: { id: SHEETS_SYNC_ID, version: data.version, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: {
      spreadsheetId: id, enabled: data.enabled, updatedById: user.id, version: { increment: 1 }, nextAttemptAt: null,
      ...(changedTarget ? { lastAttemptAt: null, lastSuccessAt: null, failureCount: 0, lastError: null, lastRowCounts: Prisma.JsonNull } : {})
    } });
    if (!result.count) throw new SheetsError("Settings changed or a sync is running. Refresh and retry after it finishes.", 409);
    return json({ saved: true });
  } catch (error) { return json({ error: error instanceof SheetsError ? error.message : "Could not save sync settings." }, error instanceof SheetsError ? error.status : 500); }
}
export async function POST(req: NextRequest) {
  const rejected = rejectForeignWrite(req); if (rejected) return rejected;
  const user = await authorized(req); if (!user) return json({ error: "Integration administration permission required." }, 403);
  const limit = checkRateLimit({ namespace: "sheets:sync", key: user.id, limit: 6, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  try { return json(await syncGoogleSheets({ manual: true })); }
  catch (error) { return json({ error: error instanceof SheetsError ? error.message : "Could not run sync." }, error instanceof SheetsError ? error.status : 500); }
}
