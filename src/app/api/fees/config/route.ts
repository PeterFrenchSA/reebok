import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const seasonalRateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  startMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12),
  endDay: z.number().int().min(1).max(31),
  priority: z.number().int().default(0),
  externalAdultNightRate: z.number().positive(),
  externalChildNightRate: z.number().nonnegative(),
  enabled: z.boolean().default(true)
});

const feeConfigSchema = z.object({
  monthlyMemberSubscription: z.number().positive(),
  memberNightRate: z.number().nonnegative(),
  dependentWithMemberNightRate: z.number().nonnegative(),
  dependentWithoutMemberNightRate: z.number().nonnegative(),
  guestOfMemberNightRate: z.number().nonnegative(),
  guestOfDependentNightRate: z.number().nonnegative(),
  mereFamilyNightRate: z.number().nonnegative(),
  externalAdultNightRate: z.number().nonnegative(),
  externalChildNightRate: z.number().nonnegative(),
  externalWholeHouseMinRate: z.number().nonnegative().optional(),
  overdueReminderEnabled: z.boolean().default(true),
  currency: z.string().default("ZAR"),
  effectiveFrom: z.coerce.date().optional(),
  seasonalRates: z.array(seasonalRateSchema).default([])
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:view")) {
    return NextResponse.json({ error: "Finance view permission required" }, { status: 403 });
  }

  const asAt = req.nextUrl.searchParams.get("asAt");
  const date = asAt ? new Date(asAt) : new Date();

  const config = await prisma.feeConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }]
    },
    orderBy: { effectiveFrom: "desc" },
    include: { seasonalRates: { orderBy: [{ priority: "desc" }, { name: "asc" }] } }
  });

  return NextResponse.json({ feeConfig: config });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) {
    return NextResponse.json({ error: "Finance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = feeConfigSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await prisma.$transaction(async (tx) => {
    const created = await tx.feeConfig.create({
      data: {
        monthlyMemberSubscription: parsed.data.monthlyMemberSubscription,
        memberNightRate: parsed.data.memberNightRate,
        dependentWithMemberNightRate: parsed.data.dependentWithMemberNightRate,
        dependentWithoutMemberNightRate: parsed.data.dependentWithoutMemberNightRate,
        guestOfMemberNightRate: parsed.data.guestOfMemberNightRate,
        guestOfDependentNightRate: parsed.data.guestOfDependentNightRate,
        mereFamilyNightRate: parsed.data.mereFamilyNightRate,
        externalAdultNightRate: parsed.data.externalAdultNightRate,
        externalChildNightRate: parsed.data.externalChildNightRate,
        externalWholeHouseMinRate: parsed.data.externalWholeHouseMinRate,
        overdueReminderEnabled: parsed.data.overdueReminderEnabled,
        currency: parsed.data.currency,
        effectiveFrom: parsed.data.effectiveFrom ?? new Date()
      }
    });

    if (parsed.data.seasonalRates.length > 0) {
      await tx.seasonalRate.createMany({
        data: parsed.data.seasonalRates.map((rate) => ({
          feeConfigId: created.id,
          name: rate.name,
          startMonth: rate.startMonth,
          startDay: rate.startDay,
          endMonth: rate.endMonth,
          endDay: rate.endDay,
          priority: rate.priority,
          externalAdultNightRate: rate.externalAdultNightRate,
          externalChildNightRate: rate.externalChildNightRate,
          enabled: rate.enabled
        }))
      });
    }

    return tx.feeConfig.findUnique({
      where: { id: created.id },
      include: { seasonalRates: true }
    });
  });

  return NextResponse.json({ feeConfig: config }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) {
    return NextResponse.json({ error: "Finance edit permission required" }, { status: 403 });
  }

  const body = await req.json();
  const payload = z
    .object({
      id: z.string(),
      isActive: z.boolean().optional(),
      effectiveTo: z.coerce.date().nullable().optional(),
      overdueReminderEnabled: z.boolean().optional(),
      externalWholeHouseMinRate: z.number().nonnegative().nullable().optional()
    })
    .safeParse(body);

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const feeConfig = await prisma.feeConfig.update({
    where: { id: payload.data.id },
    data: {
      isActive: payload.data.isActive,
      effectiveTo: payload.data.effectiveTo,
      overdueReminderEnabled: payload.data.overdueReminderEnabled,
      externalWholeHouseMinRate: payload.data.externalWholeHouseMinRate
    },
    include: { seasonalRates: true }
  });

  return NextResponse.json({ feeConfig });
}
