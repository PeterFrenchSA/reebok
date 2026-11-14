import assert from "node:assert/strict";
import test from "node:test";
import { FeeConfig, SeasonalRate, Prisma } from "@prisma/client";
import { calculateBookingFees, FeeInput } from "../src/lib/fees";
import { houseRooms } from "../src/lib/room-catalog";
import { emptyMemberCounts, roomHolds } from "../src/lib/booking-options";
import { feeConfigSchema, seasonalRateSchema } from "../src/lib/pricing-config";
import { validGuestCategories, guestBreakdownSchema } from "../src/lib/booking-guests";

const rates = { monthlyMemberSubscription: 100, memberNightRate: 50, dependentWithMemberNightRate: 25,
  dependentWithoutMemberNightRate: 60, guestOfMemberNightRate: 75, guestOfDependentNightRate: 40,
  mereFamilyNightRate: 200, externalAdultNightRate: 400, externalChildNightRate: 200 };
const config = { ...Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, new Prisma.Decimal(v)])), currency: "ZAR" } as FeeConfig;
const counts = { ...emptyMemberCounts, visitorAdult: 0, visitorChildUnder6: 0 };
const summer = { id: "summer", name: "Summer", startMonth: 12, startDay: 1, endMonth: 1, endDay: 15, priority: 100,
  enabled: true, externalAdultNightRate: new Prisma.Decimal(500), externalChildNightRate: new Prisma.Decimal(250) } as SeasonalRate;
const input: FeeInput = { source: "EXTERNAL_PUBLIC", startDate: new Date("2027-11-30T00:00:00Z"), nights: 3, counts: { ...counts, visitorAdult: 2, visitorChildUnder6: 1 } };

test("seven room catalog matches the confirmed bedding capacities", () => {
  assert.deepEqual(houseRooms.map((room) => room.capacity), [2, 3, 3, 6, 2, 2, 5]);
  assert.equal(houseRooms.reduce((sum, room) => sum + room.capacity, 0), 23);
  assert.equal(new Set(houseRooms.map((r) => r.code)).size, 7);
  assert.match(houseRooms[4].notes, /not included|not counted|unconfirmed|not confirmed/i);
});
test("member categories use their own per-person prices, unaffected by external seasons or minimum", () => {
  const quote = calculateBookingFees({ ...input, source: "INTERNAL", nights: 2, counts: { ...counts, member: 1, dependentWithMember: 1, dependentWithoutMember: 1, guestOfMember: 1, guestOfDependent: 1, mereFamily: 1 } }, { ...config, externalWholeHouseMinRate: new Prisma.Decimal(10000) }, [summer]);
  assert.equal(quote.total, 900);
  assert.equal(quote.lineItems.length, 6);
});
test("external seasons are applied per occupied night across year-end and checkout boundaries", () => {
  assert.equal(calculateBookingFees(input, config, [summer]).total, 3500);
  assert.equal(calculateBookingFees({ ...input, startDate: new Date("2027-12-31"), nights: 2 }, config, [summer]).total, 2500);
  assert.equal(calculateBookingFees({ ...input, startDate: new Date("2028-01-15"), nights: 2 }, config, [summer]).total, 2250);
  const priority = { ...summer, id: "special", name: "Special", priority: 200, externalAdultNightRate: new Prisma.Decimal(600) };
  assert.equal(calculateBookingFees({ ...input, startDate: new Date("2027-12-31"), nights: 1 }, config, [summer, priority]).total, 1450);
});
test("external minimum is per entire stay, and decimal totals round to cents", () => {
  assert.equal(calculateBookingFees(input, { ...config, externalWholeHouseMinRate: new Prisma.Decimal(5000) }, [summer]).total, 5000);
  assert.equal(calculateBookingFees({ ...input, source: "INTERNAL", counts: { ...counts, member: 3 } }, { ...config, memberNightRate: new Prisma.Decimal("0.1") }).total, 0.9);
});
test("pricing validation rejects impossible seasons, ambiguous priorities and invalid money", () => {
  const season = { ...summer, externalAdultNightRate: 500, externalChildNightRate: 250 };
  assert.equal(seasonalRateSchema.safeParse({ ...season, startMonth: 2, startDay: 30 }).success, false);
  assert.equal(feeConfigSchema.safeParse({ ...rates, seasonalRates: [season, season] }).success, false);
  for (const price of [-1, 1.001, Infinity, NaN, 1000001]) assert.equal(feeConfigSchema.safeParse({ ...rates, memberNightRate: price }).success, false);
  assert.equal(feeConfigSchema.safeParse({ ...rates, memberNightRate: 12.34, seasonalRates: [season] }).success, true);
});
test("room holds are checkout-exclusive, keep pending holds and fail closed on legacy allocations", () => {
  const held = [{ id: "safe-1", status: "PENDING", scope: "ROOM_SPECIFIC", roomIds: ["a"], startDate: "2027-12-20", endDate: "2027-12-25" }];
  assert.equal(roomHolds(held, "2027-12-24", "2027-12-26", "a").length, 1);
  assert.equal(roomHolds(held, "2027-12-25", "2027-12-27", "a").length, 0);
  assert.equal(roomHolds(held, "2027-12-24", "2027-12-26", "b").length, 0);
  assert.equal(roomHolds([{ ...held[0], roomIds: [] }], "2027-12-24", "2027-12-26", "b").length, 1);
  assert.equal(roomHolds([{ ...held[0], scope: "WHOLE_HOUSE" }], "2027-12-24", "2027-12-26", "b").length, 1);
});
test("member and external guest categories cannot be mixed", () => {
  assert.equal(validGuestCategories("INTERNAL", guestBreakdownSchema.parse({ member: 1 })), true);
  assert.equal(validGuestCategories("INTERNAL", guestBreakdownSchema.parse({ visitorAdult: 1 })), false);
  assert.equal(validGuestCategories("EXTERNAL_PUBLIC", guestBreakdownSchema.parse({ member: 1 })), false);
});
