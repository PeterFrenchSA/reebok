import { BookingAuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

const commentSchema = z.object({
  comment: z.string().min(2).max(2000)
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:approve")) {
    return NextResponse.json({ error: "Approval permission required" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await req.json();
  const parsed = commentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exists = await prisma.booking.findUnique({
    where: { id },
    select: { id: true }
  });
  if (!exists) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const auditLog = await prisma.bookingAuditLog.create({
    data: {
      bookingId: id,
      actorId: user.id,
      actorRole: user.role,
      action: BookingAuditAction.COMMENT,
      comment: parsed.data.comment
    }
  });

  return NextResponse.json({ auditLog }, { status: 201 });
}
