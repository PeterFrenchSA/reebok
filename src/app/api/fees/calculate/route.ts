import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { addDays, BookingRuleError, dateOnly, dateValue, validateStay } from "@/lib/availability";
import { guestBreakdownSchema, validGuestCategories } from "@/lib/booking-guests";
import { quoteBooking } from "@/lib/booking-pricing";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({ source: z.enum(["INTERNAL", "EXTERNAL_PUBLIC"]), startDate: dateOnly,
  nights: z.number().int().min(1).max(90), counts: guestBreakdownSchema });

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  const limit = checkRateLimit({ namespace: "fees:quote", key: rateLimitKey(req, user?.id), limit: 90, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose valid dates and guest counts." }, { status: 400 });
  const data = parsed.data;
  if (data.source === "INTERNAL" && (!user || !hasPermission(user.role, "booking:create:family"))) {
    return NextResponse.json({ error: "Member access is required for member pricing." }, { status: 403 });
  }
  const total = Object.values(data.counts).reduce((sum, n) => sum + n, 0);
  if (total < 1 || total > 50 || !validGuestCategories(data.source, data.counts)) return NextResponse.json({ error: "Guest categories must match the booking type, with 1-50 guests." }, { status: 400 });
  try {
    validateStay(data.startDate, addDays(data.startDate, data.nights));
    return NextResponse.json(await quoteBooking({ ...data, startDate: dateValue(data.startDate) }), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not calculate the estimate." }, { status: 500 });
  }
}
