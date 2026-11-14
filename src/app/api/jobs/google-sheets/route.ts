import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSheetsState, SHEETS_SYNC_ID, syncGoogleSheets } from "@/lib/google-sheets";
import { SheetsError } from "@/lib/sheets-report";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = req.headers.get("x-cron-secret") ?? "";
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureSheetsState();
    await prisma.googleSheetsSync.update({ where: { id: SHEETS_SYNC_ID }, data: { lastSchedulerAt: new Date() } });
    return NextResponse.json(await syncGoogleSheets(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof SheetsError ? error.message : "Sync job unavailable." }, { status: error instanceof SheetsError ? error.status : 500 }); }
}
