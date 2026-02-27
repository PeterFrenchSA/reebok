import { BookingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Limit public calendar payload to relevant future ranges.
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + 18);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
      startDate: { lt: horizon },
      endDate: { gt: today }
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true
    },
    take: 2000
  });

  return NextResponse.json({ bookings });
}
