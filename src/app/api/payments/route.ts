import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { buildSubscriptionCoverage } from "@/lib/fees";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const createPaymentSchema = z.object({
  bookingId: z.string().optional(),
  subscriptionUserId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default("ZAR"),
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus).default(PaymentStatus.PENDING),
  reference: z.string().max(120).optional(),
  proofFileUrl: z.string().url().optional(),
  paidAt: z.coerce.date().optional(),
  monthsCovered: z.number().int().positive().max(24).default(1),
  periodStart: z.coerce.date().optional(),
  gatewayProvider: z.string().max(50).optional(),
  gatewayPayload: z.unknown().optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:view")) {
    return NextResponse.json({ error: "Finance view permission required" }, { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      booking: { select: { id: true, startDate: true, endDate: true } },
      payer: { select: { id: true, name: true, email: true } }
    }
  });

  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  const body = await req.json();
  const parsed = createPaymentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (!data.bookingId && !data.subscriptionUserId) {
    return NextResponse.json(
      { error: "bookingId or subscriptionUserId is required" },
      { status: 400 }
    );
  }

  if (data.subscriptionUserId && (!user || !hasPermission(user.role, "finance:edit"))) {
    return NextResponse.json(
      { error: "Only shareholders/super-admin can post subscription payments" },
      { status: 403 }
    );
  }

  if (data.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId: data.bookingId,
      payerId: user?.id,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      status: data.status,
      reference: data.reference,
      proofFileUrl: data.proofFileUrl,
      paidAt: data.paidAt,
      monthsCovered: data.monthsCovered,
      periodStart: data.periodStart,
      periodEnd: data.periodStart
        ? buildSubscriptionCoverage(data.periodStart, data.monthsCovered).periodEnd
        : undefined,
      gatewayProvider: data.gatewayProvider,
      gatewayPayload: data.gatewayPayload
    }
  });

  if (data.subscriptionUserId) {
    const feeConfig =
      (await prisma.feeConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } })) ??
      (await prisma.feeConfig.create({ data: {} }));

    const subscription =
      (await prisma.subscription.findUnique({ where: { userId: data.subscriptionUserId } })) ??
      (await prisma.subscription.create({
        data: {
          userId: data.subscriptionUserId,
          monthlyAmount: feeConfig.monthlyMemberSubscription,
          reminderEnabled: true,
          arrearsAmount: 0
        }
      }));

    const periodStart = data.periodStart ?? new Date();
    const coverage = buildSubscriptionCoverage(periodStart, data.monthsCovered);

    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        periodStart: coverage.periodStart,
        periodEnd: coverage.periodEnd,
        monthsCovered: data.monthsCovered
      }
    });

    if (data.status === PaymentStatus.CONFIRMED) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          lastPaymentDate: data.paidAt ?? new Date(),
          nextDueDate: new Date(coverage.periodEnd.getTime() + 86400000)
        }
      });
    }
  }

  return NextResponse.json({ payment }, { status: 201 });
}
