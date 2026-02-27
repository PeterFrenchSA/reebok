import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { BOOKING_POLICY_ID, DEFAULT_PET_NOTICE } from "@/lib/booking-policy";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const updatePolicySchema = z.object({
  petNotice: z.string().trim().min(10).max(2000)
});

export async function GET() {
  const policy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {},
    create: { id: BOOKING_POLICY_ID, petNotice: DEFAULT_PET_NOTICE }
  });

  return NextResponse.json({ policy });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Manage bookings permission required" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const policy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: { petNotice: parsed.data.petNotice },
    create: { id: BOOKING_POLICY_ID, petNotice: parsed.data.petNotice }
  });

  return NextResponse.json({ policy });
}
