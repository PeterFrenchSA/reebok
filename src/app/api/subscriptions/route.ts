import { ReminderFrequency } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const updateSchema = z.object({
  userId: z.string().optional(),
  monthlyAmount: z.number().positive().optional(),
  arrearsAmount: z.number().nonnegative().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderFrequency: z.nativeEnum(ReminderFrequency).optional(),
  nextDueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const canViewAll = hasPermission(user.role, "finance:view");

  const subscriptions = await prisma.subscription.findMany({
    where: canViewAll ? undefined : { userId: user.id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } }
    },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) {
    return NextResponse.json({ error: "Finance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const targetUserId = parsed.data.userId;
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const subscription = await prisma.subscription.upsert({
    where: { userId: targetUserId },
    update: {
      monthlyAmount: parsed.data.monthlyAmount,
      arrearsAmount: parsed.data.arrearsAmount,
      reminderEnabled: parsed.data.reminderEnabled,
      reminderFrequency: parsed.data.reminderFrequency,
      nextDueDate: parsed.data.nextDueDate,
      notes: parsed.data.notes
    },
    create: {
      userId: targetUserId,
      monthlyAmount: parsed.data.monthlyAmount ?? 100,
      arrearsAmount: parsed.data.arrearsAmount ?? 0,
      reminderEnabled: parsed.data.reminderEnabled ?? true,
      reminderFrequency: parsed.data.reminderFrequency ?? ReminderFrequency.MONTHLY,
      nextDueDate: parsed.data.nextDueDate,
      notes: parsed.data.notes
    }
  });

  return NextResponse.json({ subscription }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const payload = await req.json();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const canEditFinance = hasPermission(user.role, "finance:edit");
  const targetUserId = parsed.data.userId ?? user.id;

  if (!canEditFinance && targetUserId !== user.id) {
    return NextResponse.json({ error: "Cannot edit other users" }, { status: 403 });
  }

  const data = canEditFinance
    ? {
        monthlyAmount: parsed.data.monthlyAmount,
        arrearsAmount: parsed.data.arrearsAmount,
        reminderEnabled: parsed.data.reminderEnabled,
        reminderFrequency: parsed.data.reminderFrequency,
        nextDueDate: parsed.data.nextDueDate,
        notes: parsed.data.notes
      }
    : {
        reminderEnabled: parsed.data.reminderEnabled,
        reminderFrequency: parsed.data.reminderFrequency
      };

  const subscription = await prisma.subscription.upsert({
    where: { userId: targetUserId },
    update: data,
    create: {
      userId: targetUserId,
      monthlyAmount: 100,
      arrearsAmount: 0,
      reminderEnabled: parsed.data.reminderEnabled ?? true,
      reminderFrequency: parsed.data.reminderFrequency ?? ReminderFrequency.MONTHLY
    }
  });

  return NextResponse.json({ subscription });
}
