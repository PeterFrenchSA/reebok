import { BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookingHorizon, dateValue, propertyToday } from "@/lib/availability";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limit = checkRateLimit({ namespace: "public:availability", key: rateLimitKey(req), limit: 120, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  const today = dateValue(propertyToday());
  const horizon = dateValue(bookingHorizon());

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
      startDate: { lt: horizon },
      endDate: { gt: today }
    },
    orderBy: { startDate: "asc" },
    select: {
      status: true,
      startDate: true,
      endDate: true
    }
  });

  return NextResponse.json({ today: propertyToday(), horizon: bookingHorizon(), bookings: bookings.map((booking, index) => ({ ...booking, id: `occupancy-${index}` })) }, { headers: { "Cache-Control": "no-store" } });
}
