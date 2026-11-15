import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { rejectForeignWrite } from "@/lib/write-origin";
import { assertReservation, BookingRuleError, dateOnly, dateValue, propertyToday, validateStay, withBookingLock } from "@/lib/availability";
import { guestBreakdownSchema, validGuestCategories } from "@/lib/booking-guests";
import { quoteBooking } from "@/lib/booking-pricing";

const schema = z.object({ startDate: dateOnly, endDate: dateOnly, reason: z.string().trim().min(5).max(1000),
  expectedUpdatedAt: z.string().datetime(), quotedTotal: z.number().finite().nonnegative(), quotedFeeConfigId: z.string().min(1) }).strict();
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectForeignWrite(req);
  if (rejected) return rejected;
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) return NextResponse.json({ error: "Booking administration permission required." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide dates, a reason and the current estimate." }, { status: 400 });
  const data = parsed.data;
  const id = (await params).id;
  try {
    const booking = await withBookingLock(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id }, include: { roomAllocations: true } });
      if (!current) throw new BookingRuleError("Booking not found.", 404);
      if (!["PENDING", "APPROVED"].includes(current.status)) throw new BookingRuleError("Only pending or approved bookings can be rescheduled.", 409);
      if (current.updatedAt.toISOString() !== data.expectedUpdatedAt) throw new BookingRuleError("Booking changed. Reload it before rescheduling.", 409);
      if (current.source !== "INTERNAL" && current.source !== "EXTERNAL_PUBLIC") throw new BookingRuleError("Imported channel bookings need separate review before rescheduling.", 409);
      const counts = guestBreakdownSchema.safeParse(current.guestBreakdown);
      if (!counts.success || !validGuestCategories(current.source, counts.data) || Object.values(counts.data).reduce((a, b) => a + b, 0) !== current.totalGuests) throw new BookingRuleError("Guest categories need correcting before dates can be changed.", 409);
      const nights = validateStay(data.startDate, data.endDate, propertyToday(), current.source);
      const startDate = dateValue(data.startDate), endDate = dateValue(data.endDate);
      if (startDate.getTime() === current.startDate.getTime() && endDate.getTime() === current.endDate.getTime()) throw new BookingRuleError("Choose new dates before saving.");
      await assertReservation(tx, { ...current, startDate, endDate });
      const quote = await quoteBooking({ source: current.source, startDate, nights, counts: counts.data }, tx);
      if (quote.feeConfigId !== data.quotedFeeConfigId || Math.round(quote.breakdown.total * 100) !== Math.round(data.quotedTotal * 100)) throw new BookingRuleError("Pricing changed. Refresh the estimate before saving.", 409);
      return tx.booking.update({ where: { id }, data: {
        startDate, endDate, nights, totalAmount: quote.breakdown.total, currency: quote.breakdown.currency,
        feeSnapshot: quote.breakdown as Prisma.InputJsonValue, status: "PENDING", approvedById: null, approvedAt: null, rejectionReason: null,
        bookingAuditLogs: { create: { actorId: user.id, actorRole: user.role, action: "COMMENT",
          comment: `Dates changed: ${current.startDate.toISOString().slice(0, 10)} to ${current.endDate.toISOString().slice(0, 10)} -> ${data.startDate} to ${data.endDate}. Estimate ${current.currency} ${current.totalAmount ?? 0} -> ${quote.breakdown.currency} ${quote.breakdown.total}. Returned to pending approval. Reason: ${data.reason}` } }
      }, select: { id: true, status: true, updatedAt: true } });
    });
    return NextResponse.json({ booking, message: "Dates changed and approval reset. Notify the family directly; no rescheduling email was sent." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BookingRuleError ? error.message : "Could not reschedule this booking." }, { status: error instanceof BookingRuleError ? error.status : 500 });
  }
}
