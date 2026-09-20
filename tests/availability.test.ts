import assert from "node:assert/strict";
import test from "node:test";
import { BookingScope, BookingStatus } from "@prisma/client";
import { blocksRooms, dateOnly, occupancyState, propertyToday, validateStay } from "../src/lib/availability";
import { calendarButtons, validWebhookSecret } from "../src/lib/telegram";
import { hasPermission } from "../src/lib/rbac";
import { canRoleVoteOnAudience } from "../src/lib/decisions";

test("room and whole-house blocking, including legacy unallocated bookings", () => {
  const room = { scope: BookingScope.ROOM_SPECIFIC, roomAllocations: [{ roomId: "a" }] };
  assert.equal(blocksRooms(room, ["a"]), true);
  assert.equal(blocksRooms(room, ["b"]), false);
  assert.equal(blocksRooms(room, []), true);
  assert.equal(blocksRooms({ scope: BookingScope.WHOLE_HOUSE, roomAllocations: [] }, ["b"]), true);
  assert.equal(blocksRooms({ scope: BookingScope.ROOM_SPECIFIC, roomAllocations: [] }, ["b"]), true);
});
test("pending and confirmed holds remain distinguishable", () => {
  assert.deepEqual(occupancyState([]), { available: true, pending: false, confirmed: false });
  assert.deepEqual(occupancyState([{ status: BookingStatus.PENDING }, { status: BookingStatus.APPROVED }]), { available: false, pending: true, confirmed: true });
});
test("dates reject ambiguity, impossible dates, reversed stays and horizon overflow", () => {
  assert.equal(dateOnly.safeParse("2027-02-29").success, false);
  assert.equal(dateOnly.safeParse("01/02/2027").success, false);
  assert.equal(dateOnly.safeParse("2028-02-29").success, true);
  assert.equal(validateStay("2027-01-01", "2027-01-02", "2027-01-01"), 1);
  for (const [start, end] of [["2027-01-01", "2027-01-01"], ["2026-12-31", "2027-01-02"], ["2027-01-01", "2027-05-01"], ["2030-01-01", "2030-01-02"]]) assert.throws(() => validateStay(start, end, "2027-01-01"));
  assert.equal(propertyToday(new Date("2027-01-01T23:00:00Z")), "2027-01-02");
});
test("shareholders can read/export finances but cannot administer", () => {
  for (const permission of ["finance:view", "finance:export", "bot:use"] as const) assert.equal(hasPermission("SHAREHOLDER", permission), true);
  for (const permission of ["finance:edit", "finance:import-export", "bot:manage", "booking:approve", "decision:review"] as const) assert.equal(hasPermission("SHAREHOLDER", permission), false);
  assert.equal(hasPermission("ADMIN", "booking:approve"), true);
  assert.equal(hasPermission("GUEST", "bot:use"), false);
  assert.equal(canRoleVoteOnAudience("SHAREHOLDER", "ADMINS_ONLY"), false);
  assert.equal(canRoleVoteOnAudience("ADMIN", "ADMINS_ONLY"), true);
});
test("webhook authentication and bounded calendar buttons", () => {
  assert.equal(validWebhookSecret("abc", "abc"), true);
  assert.equal(validWebhookSecret("abc", "abd"), false);
  assert.equal(validWebhookSecret(null, "abc"), false);
  assert.equal(validWebhookSecret("", ""), false);
  const buttons = calendarButtons("2027-02", "2027-02-10", "2027-02-15").flat();
  const dates = buttons.filter((b) => b.callback_data?.startsWith("day:")).map((b) => b.callback_data);
  assert.equal(dates.length, 6);
  assert.equal(dates[0], "day:2027-02-10");
  assert.deepEqual(calendarButtons("2027-99", "2027-02-10", "2027-02-15"), []);
});
