import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BookingRuleError } from "@/lib/availability";
import { calculateBookingFees, FeeInput } from "@/lib/fees";

export async function quoteBooking(input: FeeInput, db: Pick<Prisma.TransactionClient, "feeConfig"> = prisma) {
  const config = await db.feeConfig.findFirst({
    where: { isActive: true, effectiveFrom: { lte: input.startDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.startDate } }] },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: { seasonalRates: { where: { enabled: true } } }
  });
  if (!config) throw new BookingRuleError("Accommodation pricing has not been published for these dates. Please contact an administrator.", 503);
  const breakdown = calculateBookingFees(input, config, config.seasonalRates);
  if (!Number.isFinite(breakdown.total) || breakdown.total > 99999999.99) throw new BookingRuleError("This estimate exceeds the supported amount. Please contact an administrator.");
  return { breakdown, feeConfigId: config.id };
}
