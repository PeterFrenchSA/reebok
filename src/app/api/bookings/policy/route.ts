import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  BOOKING_POLICY_ID,
  DEFAULT_GUEST_BULLETIN_BODY,
  DEFAULT_GUEST_BULLETIN_TITLE,
  DEFAULT_PET_NOTICE
} from "@/lib/booking-policy";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const updatePolicySchema = z.object({
  petNotice: z.string().trim().min(10).max(2000).optional(),
  guestBulletinTitle: z.string().trim().min(3).max(120).optional(),
  guestBulletinBody: z.string().trim().min(10).max(6000).optional()
}).superRefine((value, ctx) => {
  if (
    value.petNotice === undefined &&
    value.guestBulletinTitle === undefined &&
    value.guestBulletinBody === undefined
  ) {
    ctx.addIssue({
      code: "custom",
      message: "At least one field must be provided."
    });
  }
});

export async function GET() {
  const policy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {},
    create: {
      id: BOOKING_POLICY_ID,
      petNotice: DEFAULT_PET_NOTICE,
      guestBulletinTitle: DEFAULT_GUEST_BULLETIN_TITLE,
      guestBulletinBody: DEFAULT_GUEST_BULLETIN_BODY
    }
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

  const existingPolicy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {},
    create: {
      id: BOOKING_POLICY_ID,
      petNotice: DEFAULT_PET_NOTICE,
      guestBulletinTitle: DEFAULT_GUEST_BULLETIN_TITLE,
      guestBulletinBody: DEFAULT_GUEST_BULLETIN_BODY
    }
  });

  const policy = await prisma.bookingPolicy.upsert({
    where: { id: BOOKING_POLICY_ID },
    update: {
      petNotice: parsed.data.petNotice ?? existingPolicy.petNotice,
      guestBulletinTitle: parsed.data.guestBulletinTitle ?? existingPolicy.guestBulletinTitle,
      guestBulletinBody: parsed.data.guestBulletinBody ?? existingPolicy.guestBulletinBody
    },
    create: {
      id: BOOKING_POLICY_ID,
      petNotice: parsed.data.petNotice ?? DEFAULT_PET_NOTICE,
      guestBulletinTitle: parsed.data.guestBulletinTitle ?? DEFAULT_GUEST_BULLETIN_TITLE,
      guestBulletinBody: parsed.data.guestBulletinBody ?? DEFAULT_GUEST_BULLETIN_BODY
    }
  });

  return NextResponse.json({ policy });
}
