import { z } from "zod";

const money = z.number().finite().nonnegative().max(1000000).multipleOf(0.01);
function monthDayValid(month: number, day: number) {
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export const seasonalRateSchema = z.object({
  name: z.string().trim().min(2).max(120), startMonth: z.number().int().min(1).max(12), startDay: z.number().int().min(1).max(31),
  endMonth: z.number().int().min(1).max(12), endDay: z.number().int().min(1).max(31), priority: z.number().int().min(0).max(1000).default(0),
  externalAdultNightRate: money, externalChildNightRate: money, enabled: z.boolean().default(true)
}).refine((rate) => monthDayValid(rate.startMonth, rate.startDay) && monthDayValid(rate.endMonth, rate.endDay), "Season dates must be real calendar dates.");

export const feeConfigSchema = z.object({
  monthlyMemberSubscription: money, memberNightRate: money, dependentWithMemberNightRate: money,
  dependentWithoutMemberNightRate: money, guestOfMemberNightRate: money, guestOfDependentNightRate: money, mereFamilyNightRate: money,
  externalAdultNightRate: money, externalChildNightRate: money, externalWholeHouseMinRate: money.nullable().optional(),
  overdueReminderEnabled: z.boolean().default(true), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("ZAR"),
  effectiveFrom: z.coerce.date().optional(), seasonalRates: z.array(seasonalRateSchema).max(24).default([]),
  basedOnId: z.string().nullable().optional()
}).superRefine((config, context) => {
  const priorities = config.seasonalRates.filter((rate) => rate.enabled).map((rate) => rate.priority);
  if (new Set(priorities).size !== priorities.length) context.addIssue({ code: "custom", path: ["seasonalRates"], message: "Give each enabled season a different priority so overlapping seasons are unambiguous." });
});
