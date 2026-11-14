import { BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookingHorizon, dateValue, occupancySelect, propertyToday } from "@/lib/availability";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const memberMode = req.nextUrl.searchParams.get("mode") === "member";
  const exclude = req.nextUrl.searchParams.get("exclude") || undefined;
  if (exclude && !memberMode) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  if (memberMode) {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!hasPermission(user.role, "booking:create:family")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
    if (exclude) {
      const booking = await prisma.booking.findUnique({ where: { id: exclude }, select: { requestedById: true } });
      if (!booking || (!hasPermission(user.role, "booking:manage") && booking.requestedById !== user.id)) return NextResponse.json({ error: "Booking not found or access denied." }, { status: 404 });
    }
  }
  const limit = checkRateLimit({ namespace: "public:availability", key: rateLimitKey(req), limit: 120, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  const today = propertyToday(), horizon = bookingHorizon();
  const bookings = await prisma.booking.findMany({
    where: { id: exclude ? { not: exclude } : undefined, status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] }, startDate: { lt: dateValue(horizon) }, endDate: { gt: dateValue(today) } },
    orderBy: { startDate: "asc" }, select: occupancySelect
  });
  const rooms = memberMode ? await prisma.room.findMany({ where: { isBookable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, capacity: true, notes: true, code: true } }) : undefined;
  return NextResponse.json({ today, horizon, rooms, bookings: bookings.map((booking, index) => ({
    id: `occupancy-${index}`, status: booking.status, startDate: booking.startDate, endDate: booking.endDate,
    ...(memberMode ? { scope: booking.scope, roomIds: booking.roomAllocations.map((allocation) => allocation.roomId) } : {})
  })) }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
