import { z } from "zod";

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
