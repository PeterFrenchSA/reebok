import { NextRequest, NextResponse } from "next/server";

export function rejectForeignWrite(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || req.url).origin;
  // Non-browser API clients may omit Origin. Browser writes must be same-origin.
  if ((origin && origin !== expected) || req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  return null;
}
