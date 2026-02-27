import { BookingAuditAction, BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

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
    return NextResponse.json({ booking: existing, message: "Booking already approved" });
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
    await sendMail({
      to: requesterEmail,
      subject: `Booking approved (${booking.startDate.toISOString().slice(0, 10)} to ${booking.endDate
        .toISOString()
        .slice(0, 10)})`,
      text: `Your booking (${booking.id}) is approved. Amount due: ${booking.currency} ${booking.totalAmount ?? 0}.`
    });
  }

  return NextResponse.json({ booking });
}
