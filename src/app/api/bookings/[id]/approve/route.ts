import { assertReservation, BookingRuleError, withBookingLock } from "@/lib/availability";
import { BookingAuditAction, BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  buildManageBookingUrl,
  generateBookingManageToken,
  getAppBaseUrl,
  hashBookingManageToken
} from "@/lib/booking-manage";
import { renderEmailTemplate } from "@/lib/email-templates";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

const requesterSelect = {
  id: true,
  name: true,
  email: true,
  role: true
} as const;

function asDateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function sanitizeBooking<T extends { manageToken?: string | null }>(booking: T) {
  const { manageToken: _manageToken, ...safeBooking } = booking;
  return safeBooking;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:approve")) {
    return NextResponse.json({ error: "Approval permission required" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.booking.findUnique({
    where: { id },
    include: { requestedBy: { select: requesterSelect } }
  });

  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (existing.status === BookingStatus.APPROVED) {
    return NextResponse.json({ booking: sanitizeBooking(existing), message: "Booking already approved" });
  }

  let booking;
  try {
  booking = await withBookingLock(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id }, include: { roomAllocations: true } });
    if (!current || current.status !== BookingStatus.PENDING) throw new BookingRuleError("Only pending bookings can be approved.", 409);
    await assertReservation(tx, { ...current, roomAllocations: current.roomAllocations });
    const booking = await tx.booking.update(
    {
      where: { id },
      data: {
        status: BookingStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: null
      },
      include: { requestedBy: { select: requesterSelect } }
    });
    await tx.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: user.id,
        actorRole: user.role,
        action: BookingAuditAction.APPROVED,
        comment: "Booking approved."
      }
    });
    return booking;
  });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const requesterEmail = booking.requestedBy?.email ?? booking.externalLeadEmail;
  if (requesterEmail) {
    const rawManageToken = generateBookingManageToken();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { manageToken: hashBookingManageToken(rawManageToken) }
    });

    const manageUrl = buildManageBookingUrl(booking.id, rawManageToken, requesterEmail);
    const template = await renderEmailTemplate("BOOKING_APPROVED", {
      BOOKING_REFERENCE: booking.id,
      START_DATE: asDateLabel(booking.startDate),
      END_DATE: asDateLabel(booking.endDate),
      TOTAL_GUESTS: String(booking.totalGuests),
      PET_COUNT: String(booking.petCount),
      CURRENCY: booking.currency,
      TOTAL_AMOUNT: String(booking.totalAmount ?? 0),
      SOURCE: booking.source,
      SCOPE: booking.scope,
      REJECTION_REASON: "",
      MANAGE_URL: manageUrl,
      ADMIN_BOOKINGS_URL: `${getAppBaseUrl()}/admin/bookings`
    });

    await sendMail({
      to: requesterEmail,
      subject: template.subject,
      text: template.text
    });
  }

  return NextResponse.json({ booking: sanitizeBooking(booking) });
}
