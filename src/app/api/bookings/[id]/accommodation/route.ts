import { BookingAuditAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { assertReservation, BookingRuleError, withBookingLock } from "@/lib/availability";
import { guestBreakdownSchema, roomAllocationSchema, validGuestCategories } from "@/lib/booking-guests";
import { quoteBooking } from "@/lib/booking-pricing";
import { rejectForeignWrite } from "@/lib/write-origin";

const schema = z.object({ scope: z.enum(["WHOLE_HOUSE", "ROOM_SPECIFIC"]), roomAllocations: z.array(roomAllocationSchema).max(50),
  guestBreakdown: guestBreakdownSchema, reason: z.string().trim().min(5).max(1000), expectedUpdatedAt: z.string().datetime(),
  quotedTotal: z.number().finite().nonnegative(), quotedFeeConfigId: z.string().min(1) }).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectForeignWrite(req);
  if (rejected) return rejected;
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) return NextResponse.json({ error: "Booking administration permission required." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide rooms, guest categories, a current estimate and a correction reason." }, { status: 400 });
  const data = parsed.data;
  if (!validGuestCategories("INTERNAL", data.guestBreakdown)) return NextResponse.json({ error: "Use member guest categories." }, { status: 400 });
  const { id } = await params;
  try {
    const booking = await withBookingLock(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id }, include: { requestedBy: { select: { isActive: true, role: true } }, roomAllocations: { include: { room: { select: { name: true } } } } } });
      if (!current) throw new BookingRuleError("Booking not found.", 404);
      if (!["PENDING", "APPROVED"].includes(current.status)) throw new BookingRuleError("Only active pending or approved bookings can be corrected.", 409);
      if (current.updatedAt.toISOString() !== data.expectedUpdatedAt) throw new BookingRuleError("This booking changed. Refresh it before making a correction.", 409);
      if (current.source !== "INTERNAL" && (current.source !== "EXTERNAL_PUBLIC" || !current.requestedBy?.isActive || !hasPermission(current.requestedBy.role, "booking:create:family"))) {
        throw new BookingRuleError("Only a booking owned by an active member can be converted from public to member accommodation.", 403);
      }
      const total = Object.values(data.guestBreakdown).reduce((sum, n) => sum + n, 0);
      if (total !== current.totalGuests) throw new BookingRuleError("Guest categories must account for the booking's existing guest total.");
      await assertReservation(tx, { ...current, scope: data.scope, roomAllocations: data.roomAllocations });
      const quote = await quoteBooking({ source: "INTERNAL", startDate: current.startDate, nights: current.nights, counts: data.guestBreakdown }, tx);
      if (quote.feeConfigId !== data.quotedFeeConfigId || Math.round(quote.breakdown.total * 100) !== Math.round(data.quotedTotal * 100)) throw new BookingRuleError("Pricing changed. Refresh the estimate and retry.", 409);
      const rooms = await tx.room.findMany({ where: { id: { in: [...current.roomAllocations, ...data.roomAllocations].map((a) => a.roomId) } }, select: { id: true, name: true } });
      const describe = (scope: string, allocations: Array<{ roomId: string; guestCount: number }>) => scope === "WHOLE_HOUSE" ? "whole house" : allocations.map((a) => `${rooms.find((room) => room.id === a.roomId)?.name ?? a.roomId}: ${a.guestCount} guests`).join(", ");
      await tx.bookingRoomAllocation.deleteMany({ where: { bookingId: id } });
      const updated = await tx.booking.update({ where: { id }, data: {
        source: "INTERNAL", scope: data.scope, roomAllocations: { create: data.roomAllocations }, guestBreakdown: data.guestBreakdown,
        status: "PENDING", approvedById: null, approvedAt: null, rejectionReason: null,
        totalAmount: quote.breakdown.total, currency: quote.breakdown.currency, feeSnapshot: quote.breakdown as Prisma.InputJsonValue,
        bookingAuditLogs: { create: { actorId: user.id, actorRole: user.role, action: BookingAuditAction.COMMENT,
          comment: `Accommodation correction: ${current.source} ${describe(current.scope, current.roomAllocations)} -> INTERNAL ${describe(data.scope, data.roomAllocations)}. Estimate ${current.currency} ${current.totalAmount ?? 0} -> ${quote.breakdown.currency} ${quote.breakdown.total}. Guest categories: ${JSON.stringify(current.guestBreakdown)} -> ${JSON.stringify(data.guestBreakdown)}. Returned to pending approval. Reason: ${data.reason}` } }
      }, select: { id: true, status: true, updatedAt: true } });
      return updated;
    });
    return NextResponse.json({ booking, message: "Accommodation corrected and returned to pending approval. Notify the family of the revised rooms and estimate; this correction does not send an email." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not correct this booking." }, { status: 500 });
  }
}
