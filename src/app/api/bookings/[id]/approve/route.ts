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
    include: { requestedBy: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (existing.status === BookingStatus.APPROVED) {
    return NextResponse.json({ booking: sanitizeBooking(existing), message: "Booking already approved" });
  }

  const [booking] = await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: null
      },
      include: { requestedBy: true }
    }),
    prisma.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: user.id,
        actorRole: user.role,
        action: BookingAuditAction.APPROVED,
        comment: "Booking approved."
      }
    })
  ]);

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
