import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { BookingRuleError, dateValue, propertyToday, withBookingLock } from "@/lib/availability";
import { houseRooms } from "@/lib/room-catalog";
import { rejectForeignWrite } from "@/lib/write-origin";

const roomSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40), capacity: z.number().int().positive().max(50),
  isBookable: z.boolean().default(true), notes: z.string().trim().max(1000).optional() });

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!hasPermission(user.role, "booking:create:family")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  const rooms = await prisma.room.findMany({ where: hasPermission(user.role, "booking:manage") ? undefined : { isBookable: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ rooms }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export async function POST(req: NextRequest) {
  const rejected = rejectForeignWrite(req);
  if (rejected) return rejected;
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) return NextResponse.json({ error: "Room management permission required." }, { status: 403 });
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "initialize-house") {
      const rooms = await withBookingLock(async (tx) => {
        // Never silently replace legacy rooms or duplicate an existing inventory.
        if (await tx.room.count()) throw new BookingRuleError("Rooms already exist. Review them rather than installing duplicate rooms.", 409);
        await tx.room.createMany({ data: houseRooms.map((room) => ({ ...room })) });
        return tx.room.findMany({ orderBy: { name: "asc" } });
      });
      return NextResponse.json({ rooms }, { status: 201 });
    }
    const parsed = roomSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Check the room name, code, capacity and description." }, { status: 400 });
    const { id, ...data } = parsed.data;
    const room = await withBookingLock(async (tx) => {
      if (id) {
        const existing = await tx.room.findUnique({ where: { id } });
        if (!existing) throw new BookingRuleError("Room not found.", 404);
        const active = { status: { in: ["PENDING", "APPROVED"] as ("PENDING" | "APPROVED")[] }, endDate: { gt: dateValue(propertyToday()) } };
        const allocations = await tx.bookingRoomAllocation.findMany({ where: { roomId: id, booking: active }, select: { guestCount: true } });
        if (allocations.some((allocation) => !data.isBookable || allocation.guestCount > data.capacity)) throw new BookingRuleError("This change would invalidate an active room reservation. Correct the booking first.", 409);
        const others = await tx.room.aggregate({ where: { id: { not: id }, isBookable: true }, _sum: { capacity: true } });
        const capacity = (others._sum.capacity ?? 0) + (data.isBookable ? data.capacity : 0);
        if (await tx.booking.count({ where: { ...active, scope: "WHOLE_HOUSE", totalGuests: { gt: capacity } } })) throw new BookingRuleError("This change would exceed capacity for an active whole-house booking.", 409);
        return tx.room.update({ where: { id }, data });
      }
      return tx.room.create({ data });
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "That room code already exists." }, { status: 409 });
    return NextResponse.json({ error: "Could not save room configuration." }, { status: 500 });
  }
}
