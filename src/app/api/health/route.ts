import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = checkRateLimit({ namespace: "health", key: rateLimitKey(req), limit: 120, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    const id = process.env.APP_RELEASE ?? "";
    const release = /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : "unmanaged";
    return NextResponse.json({ ok: true, release }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
