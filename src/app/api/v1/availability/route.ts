import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { BookingRuleError, getAvailability } from "@/lib/availability";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!hasPermission(user.role, "bot:use")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  const limit = checkRateLimit({ namespace: "availability", key: user.id, limit: 60, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  try {
    const query = req.nextUrl.searchParams;
    const availability = await getAvailability(query.get("startDate") ?? "", query.get("endDate") ?? "", query.getAll("roomId"));
    return NextResponse.json(availability, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
