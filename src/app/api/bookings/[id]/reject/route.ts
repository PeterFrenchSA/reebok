import { BookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const rejectSchema = z.object({
  reason: z.string().min(3).max(500)
});

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:approve")) {
    return NextResponse.json({ error: "Approval permission required" }, { status: 403 });
  }

  const { id } = params;
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

  const booking = await prisma.booking.update({
    where: { id },
    data: {
      status: BookingStatus.REJECTED,
      approvedById: user.id,
      approvedAt: new Date(),
      rejectionReason: parsed.data.reason
    },
    include: { requestedBy: true }
  });

  const requesterEmail = booking.requestedBy?.email ?? booking.externalLeadEmail;
  if (requesterEmail) {
    await sendMail({
      to: requesterEmail,
      subject: `Booking declined (${booking.startDate.toISOString().slice(0, 10)} to ${booking.endDate
        .toISOString()
        .slice(0, 10)})`,
      text: `Your booking (${booking.id}) was not approved. Reason: ${parsed.data.reason}`
    });
  }

  return NextResponse.json({ booking });
}
