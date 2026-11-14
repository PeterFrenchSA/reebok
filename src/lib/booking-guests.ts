import { z } from "zod";

export const roomAllocationSchema = z.object({
  roomId: z.string().min(1).max(120),
  guestLabel: z.string().trim().max(120).optional(),
  guestCount: z.number().int().min(1).max(50)
});

export function validGuestCategories(source: string, counts: Record<string, number>): boolean {
  return source === "INTERNAL"
    ? !counts.visitorAdult && !counts.visitorChildUnder6
    : Object.entries(counts).every(([key, count]) => count === 0 || ["visitorAdult", "visitorChildUnder6"].includes(key));
}

export const guestBreakdownSchema = z
  .object({
    member: z.number().int().nonnegative().default(0),
    dependentWithMember: z.number().int().nonnegative().default(0),
    dependentWithoutMember: z.number().int().nonnegative().default(0),
    guestOfMember: z.number().int().nonnegative().default(0),
    guestOfDependent: z.number().int().nonnegative().default(0),
    mereFamily: z.number().int().nonnegative().default(0),
    visitorAdult: z.number().int().nonnegative().default(0),
    visitorChildUnder6: z.number().int().nonnegative().default(0)
  })
  .default({
    member: 0,
    dependentWithMember: 0,
    dependentWithoutMember: 0,
    guestOfMember: 0,
    guestOfDependent: 0,
    mereFamily: 0,
    visitorAdult: 0,
    visitorChildUnder6: 0
  });
