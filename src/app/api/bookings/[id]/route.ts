import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) return NextResponse.json({ error: "Booking administration permission required." }, { status: 403 });
  const booking = await prisma.booking.findUnique({ where: { id: (await params).id }, select: {
    id: true, source: true, scope: true, status: true, startDate: true, endDate: true, nights: true, totalGuests: true, petCount: true,
    totalAmount: true, currency: true, notes: true, guestBreakdown: true, updatedAt: true, rejectionReason: true,
    requestedBy: { select: { name: true, email: true } }, externalLeadName: true, externalLeadEmail: true, externalLeadPhone: true,
    roomAllocations: { select: { roomId: true, guestCount: true, guestLabel: true, room: { select: { name: true } } } },
    bookingAuditLogs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200, select: { id: true, action: true, comment: true, createdAt: true, actor: { select: { name: true } } } }
  } });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ booking }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
