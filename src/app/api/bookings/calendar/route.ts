import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { dateOnly, dateValue, propertyToday } from "@/lib/availability";
import { sharedBookingName } from "@/lib/booking-calendar";

const querySchema = z.object({ start: dateOnly, end: dateOnly, status: z.enum(["ACTIVE", "ALL", "PENDING", "APPROVED"]).default("ACTIVE") });
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!hasPermission(user.role, "booking:create:family")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  const admin = hasPermission(user.role, "booking:manage");
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid calendar date range and status." }, { status: 400 });
  const { start, end, status } = parsed.data;
  const days = (dateValue(end).getTime() - dateValue(start).getTime()) / 86400000;
  if (days < 1 || days > 62) return NextResponse.json({ error: "View between 1 and 62 days at a time." }, { status: 400 });
  if (!admin && status === "ALL") return NextResponse.json({ error: "Booking history is private to administrators." }, { status: 403 });
  const today = propertyToday();
  const bookings = await prisma.booking.findMany({ where: {
    startDate: { lt: dateValue(end) }, endDate: { gt: dateValue(!admin && start < today ? today : start) },
    status: status === "ALL" ? undefined : status === "ACTIVE" ? { in: ["PENDING", "APPROVED"] } : status
  }, orderBy: [{ startDate: "asc" }, { id: "asc" }], take: 2001,
    select: { id: true, startDate: true, endDate: true, status: true, scope: true, totalGuests: true, petCount: true, requestedById: true,
      requestedBy: { select: { name: true, role: true } }, externalLeadName: true,
      roomAllocations: { select: { guestCount: true, room: { select: { id: true, name: true } } } } }
  });
  if (bookings.length > 2000) return NextResponse.json({ error: "Too many bookings in this range. Select a shorter period." }, { status: 422 });
  const rooms = await prisma.room.findMany({ where: admin ? undefined : { isBookable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, capacity: true, isBookable: true } });
  return NextResponse.json({ today, start, end, admin, rooms, bookings: bookings.map((booking, index) => ({
    id: admin || booking.requestedById === user.id ? booking.id : `occupancy-${index}`,
    startDate: booking.startDate, endDate: booking.endDate, status: booking.status, scope: booking.scope,
    displayName: admin ? booking.requestedBy?.name ?? booking.externalLeadName ?? "Guest stay" : sharedBookingName(booking),
    totalGuests: booking.totalGuests, petCount: booking.petCount, isOwnBooking: booking.requestedById === user.id,
    rooms: booking.roomAllocations.map((a) => ({ ...a.room, guestCount: a.guestCount }))
  })) }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
