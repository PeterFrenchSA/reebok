import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateBookingFees } from "@/lib/fees";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  source: z.enum(["INTERNAL", "EXTERNAL_PUBLIC"]),
  startDate: z.coerce.date(),
  nights: z.number().int().positive(),
  counts: z.object({
    member: z.number().int().nonnegative().default(0),
    dependentWithMember: z.number().int().nonnegative().default(0),
    dependentWithoutMember: z.number().int().nonnegative().default(0),
    guestOfMember: z.number().int().nonnegative().default(0),
    guestOfDependent: z.number().int().nonnegative().default(0),
    mereFamily: z.number().int().nonnegative().default(0),
    visitorAdult: z.number().int().nonnegative().default(0),
    visitorChildUnder6: z.number().int().nonnegative().default(0)
  })
});

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const feeConfig =
    (await prisma.feeConfig.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: parsed.data.startDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: parsed.data.startDate } }]
      },
      orderBy: { effectiveFrom: "desc" }
    })) ?? (await prisma.feeConfig.create({ data: {} }));

  const seasonalRates = await prisma.seasonalRate.findMany({
    where: { feeConfigId: feeConfig.id, enabled: true }
  });

  const breakdown = calculateBookingFees(parsed.data, feeConfig, seasonalRates);

  return NextResponse.json({
    breakdown,
    feeConfigId: feeConfig.id
  });
}
