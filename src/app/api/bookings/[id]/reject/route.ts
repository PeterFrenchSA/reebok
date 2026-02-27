import { BookingAuditAction, BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { buildManageBookingUrl, generateBookingManageToken, getAppBaseUrl } from "@/lib/booking-manage";
import { renderEmailTemplate } from "@/lib/email-templates";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const rejectSchema = z.object({
  reason: z.string().min(3).max(500)
});

type RouteContext = { params: Promise<{ id: string }> };

function asDateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:approve")) {
    return NextResponse.json({ error: "Approval permission required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = rejectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.booking.findUnique({
    where: { id },
    include: { requestedBy: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const [booking] = await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.REJECTED,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: parsed.data.reason
      },
      include: { requestedBy: true }
    }),
    prisma.bookingAuditLog.create({
      data: {
        bookingId: id,
        actorId: user.id,
        actorRole: user.role,
        action: BookingAuditAction.REJECTED,
        comment: parsed.data.reason
      }
    })
  ]);

  const requesterEmail = booking.requestedBy?.email ?? booking.externalLeadEmail;
  if (requesterEmail) {
    let manageToken = booking.manageToken;
    if (!manageToken) {
      manageToken = generateBookingManageToken();
      await prisma.booking.update({
        where: { id: booking.id },
        data: { manageToken }
      });
    }

    const manageUrl = buildManageBookingUrl(booking.id, manageToken, requesterEmail);
    const template = await renderEmailTemplate("BOOKING_REJECTED", {
      BOOKING_REFERENCE: booking.id,
      START_DATE: asDateLabel(booking.startDate),
      END_DATE: asDateLabel(booking.endDate),
      TOTAL_GUESTS: String(booking.totalGuests),
      PET_COUNT: String(booking.petCount),
      CURRENCY: booking.currency,
      TOTAL_AMOUNT: String(booking.totalAmount ?? 0),
      SOURCE: booking.source,
      SCOPE: booking.scope,
      REJECTION_REASON: parsed.data.reason,
      MANAGE_URL: manageUrl,
      ADMIN_BOOKINGS_URL: `${getAppBaseUrl()}/admin/bookings`
    });

    await sendMail({
      to: requesterEmail,
      subject: template.subject,
      text: template.text
    });
  }

  return NextResponse.json({ booking });
}
