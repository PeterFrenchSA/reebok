import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { prisma } from "../src/lib/prisma";
import { addDays, propertyToday, getAvailability } from "../src/lib/availability";

export async function testMemberBookings(t: TestContext, base: string, cookies: Record<string, string>, memberId: string, roomA: string, roomB: string) {
  const day = (n: number) => addDays(propertyToday(), n);
  async function api(path: string, role?: string, body?: unknown, method = body ? "POST" : "GET") {
    const response = await fetch(base + path, { method, redirect: "manual", headers: { ...(role ? { cookie: cookies[role] } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }
  const payload = { source: "INTERNAL", scope: "ROOM_SPECIFIC", startDate: day(150), endDate: day(152),
    guestBreakdown: { member: 1, guestOfMember: 2 }, roomAllocations: [{ roomId: roomA, guestCount: 2, guestLabel: "Private family label" }, { roomId: roomB, guestCount: 1 }] };
  await t.test("member pages, private calendar and pricing endpoints enforce role boundaries", async () => {
    for (const role of [undefined, "GUEST"]) {
      assert.equal((await api("/member/book", role)).status, 307);
      assert.equal((await api("/api/bookings/availability?mode=member", role)).status, role ? 403 : 401);
      assert.equal((await api("/api/fees/calculate", role, { source: "INTERNAL", startDate: day(150), nights: 2, counts: { member: 1 } })).status, 403);
      assert.equal((await api("/api/bookings", role, { ...payload, source: "EXTERNAL_PUBLIC", guestBreakdown: { visitorAdult: 3 } })).status, 400);
    }
    for (const role of ["FAMILY_MEMBER", "SHAREHOLDER", "ADMIN", "SUPER_ADMIN"]) {
      assert.equal((await api("/member/book", role)).status, 200);
      assert.equal((await api("/", role)).headers.get("location"), "/member/book");
    }
    for (const role of [undefined, "GUEST", "FAMILY_MEMBER", "SHAREHOLDER"]) {
      assert.equal((await api("/admin/pricing", role)).status, 307);
      assert.equal((await api("/api/fees/config", role, {})).status, 403);
      assert.equal((await api("/api/rooms", role, { action: "initialize-house" })).status, 403);
    }
    assert.equal((await api("/api/fees/config?history=true", "SHAREHOLDER")).status, 200);
    assert.equal((await api("/api/fees/config", "FAMILY_MEMBER")).status, 403);
    assert.equal((await api("/api/fees/config?asAt=invalid", "ADMIN")).status, 400);
    assert.equal((await api("/admin/pricing", "ADMIN")).status, 200);
    for (const endpoint of ["/api/rooms", "/api/fees/config", "/api/bookings/missing/accommodation"]) {
      const response = await fetch(base + endpoint, { method: endpoint.endsWith("accommodation") ? "PATCH" : "POST",
        headers: { cookie: cookies.ADMIN, origin: "https://untrusted.invalid", "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 403);
    }
  });
  await t.test("multi-room member booking prices all categories and protects room and whole-house capacity", async () => {
    const quote = await api("/api/fees/calculate", "FAMILY_MEMBER", { source: "INTERNAL", startDate: day(150), nights: 2, counts: payload.guestBreakdown });
    assert.equal(quote.status, 200);
    const created = await api("/api/bookings", "SHAREHOLDER", { ...payload, quotedTotal: quote.data.breakdown.total, quotedFeeConfigId: quote.data.feeConfigId });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(Number(created.data.booking.totalAmount), quote.data.breakdown.total);
    assert.equal(created.data.booking.roomAllocations.length, 2);
    assert.equal((await api("/api/bookings", "ADMIN", payload)).status, 409);
    const bad = { ...payload, startDate: day(155), endDate: day(156) };
    assert.equal((await api("/api/bookings", "ADMIN", { ...bad, roomAllocations: [{ roomId: roomA, guestCount: 3 }] })).status, 400);
    assert.equal((await api("/api/bookings", "ADMIN", { ...bad, roomAllocations: [{ roomId: roomA, guestCount: 1 }, { roomId: roomA, guestCount: 2 }] })).status, 400);
    assert.equal((await api("/api/bookings", "ADMIN", { ...bad, scope: "WHOLE_HOUSE", roomAllocations: [], guestBreakdown: { member: 5 } })).status, 400);
    assert.equal((await api("/api/bookings", "ADMIN", { ...bad, quotedTotal: 0 })).status, 409);
    const calendar = await api("/api/bookings/availability?mode=member", "FAMILY_MEMBER");
    assert.equal(calendar.status, 200);
    const serialized = JSON.stringify(calendar.data);
    for (const secret of ["Private family label", created.data.booking.id, "shareholder@test.invalid", "totalAmount", "requestedBy"]) assert.equal(serialized.includes(secret), false);
    assert.ok(calendar.data.bookings.some((b: { roomIds: string[] }) => b.roomIds.includes(roomA)));
    assert.equal((await api(`/api/bookings/availability?mode=member&exclude=${created.data.booking.id}`, "FAMILY_MEMBER")).status, 404);
    assert.equal((await api(`/api/bookings/availability?mode=member&exclude=${created.data.booking.id}`, "SHAREHOLDER")).status, 200);
    const publicCalendar = (await api("/api/bookings/availability")).data;
    assert.equal(publicCalendar.rooms, undefined);
    assert.equal(JSON.stringify(publicCalendar).includes("roomIds"), false);
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomA } });
    const update = { id: room.id, name: room.name, code: "AA", capacity: 1 };
    assert.equal((await api("/api/rooms", "ADMIN", update)).status, 409);
    assert.equal((await api("/api/rooms", "ADMIN", { ...update, capacity: 2, isBookable: false })).status, 409);
    assert.equal((await api("/api/rooms", "ADMIN", { action: "initialize-house" })).status, 409);
  });
  await t.test("admin room correction releases only unused rooms, reapproves and audits; guests and stale writes are blocked", async () => {
    const original = await prisma.booking.create({ data: { source: "EXTERNAL_PUBLIC", scope: "WHOLE_HOUSE", status: "APPROVED", startDate: new Date(day(160)), endDate: new Date(day(162)), nights: 2, totalGuests: 2, requestedById: memberId, totalAmount: 1600, guestBreakdown: { visitorAdult: 2 } } });
    const quote = (await api("/api/fees/calculate", "ADMIN", { source: "INTERNAL", startDate: day(160), nights: 2, counts: { member: 1, guestOfMember: 1 } })).data;
    const correction = { scope: "ROOM_SPECIFIC", roomAllocations: [{ roomId: roomA, guestCount: 2 }], guestBreakdown: { member: 1, guestOfMember: 1 },
      reason: "Family agreed to Room A; release the other room.", expectedUpdatedAt: original.updatedAt.toISOString(), quotedFeeConfigId: quote.feeConfigId, quotedTotal: quote.breakdown.total };
    const endpoint = `/api/bookings/${original.id}/accommodation`;
    for (const role of [undefined, "GUEST", "FAMILY_MEMBER", "SHAREHOLDER"]) assert.equal((await api(endpoint, role, correction, "PATCH")).status, 403);
    assert.equal((await api(endpoint, "ADMIN", { ...correction, reason: "" }, "PATCH")).status, 400);
    assert.equal((await api(endpoint, "ADMIN", { ...correction, quotedTotal: 0 }, "PATCH")).status, 409);
    assert.equal((await api(endpoint, "ADMIN", correction, "PATCH")).status, 200);
    const updated = await prisma.booking.findUniqueOrThrow({ where: { id: original.id }, include: { roomAllocations: true, bookingAuditLogs: true } });
    assert.equal(updated.source, "INTERNAL"); assert.equal(updated.status, "PENDING"); assert.equal(updated.approvedAt, null);
    assert.equal(Number(updated.totalAmount), quote.breakdown.total);
    assert.equal(updated.roomAllocations.length, 1);
    assert.match(updated.bookingAuditLogs[0].comment!, /Family agreed to Room A/);
    assert.match(updated.bookingAuditLogs[0].comment!, /Room A: 2 guests/);
    assert.equal((await api(endpoint, "ADMIN", correction, "PATCH")).status, 409);
    assert.equal((await getAvailability(day(160), day(162), [roomA])).available, false);
    assert.equal((await getAvailability(day(160), day(162), [roomB])).available, true);
    const other = await api("/api/bookings", "SHAREHOLDER", { ...payload, startDate: day(160), endDate: day(162), guestBreakdown: { member: 1 }, roomAllocations: [{ roomId: roomB, guestCount: 1 }] });
    assert.equal(other.status, 200);
    assert.equal((await api(endpoint, "ADMIN", { ...correction, scope: "WHOLE_HOUSE", roomAllocations: [], expectedUpdatedAt: updated.updatedAt.toISOString() }, "PATCH")).status, 409);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: original.id } })).scope, "ROOM_SPECIFIC");
    const guestBooking = await prisma.booking.create({ data: { source: "EXTERNAL_PUBLIC", scope: "WHOLE_HOUSE", status: "PENDING", startDate: new Date(day(165)), endDate: new Date(day(167)), nights: 2, totalGuests: 2 } });
    assert.equal((await api(`/api/bookings/${guestBooking.id}/accommodation`, "ADMIN", { ...correction, expectedUpdatedAt: guestBooking.updatedAt.toISOString() }, "PATCH")).status, 403);
  });
  await t.test("dated pricing versions detect stale drafts and quotes without changing saved bookings", async () => {
    const original = await prisma.feeConfig.findFirstOrThrow();
    const booking = await prisma.booking.findFirstOrThrow();
    const subscription = await prisma.subscription.upsert({ where: { userId: memberId }, create: { userId: memberId, monthlyAmount: 123 }, update: {} });
    const { id: _id, effectiveTo: _to, createdAt: _created, updatedAt: _updated, ...rest } = original;
    const body = JSON.parse(JSON.stringify(rest));
    for (const key of Object.keys(body)) if (key.endsWith("Rate") || key === "monthlyMemberSubscription") body[key] = body[key] == null ? null : Number(body[key]);
    const draft = { ...body, effectiveFrom: day(180), memberNightRate: 123, monthlyMemberSubscription: 222, basedOnId: original.id };
    const published = await api("/api/fees/config", "ADMIN", draft);
    assert.equal(published.status, 201, JSON.stringify(published.data));
    try {
      assert.equal((await api("/api/fees/config", "ADMIN", draft)).status, 409);
      assert.equal((await api("/api/fees/config", "ADMIN", { ...draft, memberNightRate: -1 })).status, 400);
      const quote = await api("/api/fees/calculate", "FAMILY_MEMBER", { source: "INTERNAL", startDate: day(180), nights: 2, counts: { member: 1 } });
      assert.equal(quote.data.breakdown.total, 246);
      const before = await api("/api/fees/calculate", "FAMILY_MEMBER", { source: "INTERNAL", startDate: day(179), nights: 2, counts: { member: 1 } });
      assert.equal(before.data.breakdown.total, Number(original.memberNightRate) * 2);
      assert.equal((await api("/api/bookings", "ADMIN", { ...payload, startDate: day(180), endDate: day(182), guestBreakdown: { member: 1 }, roomAllocations: [{ roomId: roomA, guestCount: 1 }], quotedFeeConfigId: original.id, quotedTotal: before.data.breakdown.total })).status, 409);
      assert.equal(String((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalAmount), String(booking.totalAmount));
      assert.equal(String((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).monthlyAmount), String(subscription.monthlyAmount));
    } finally { await prisma.feeConfig.delete({ where: { id: published.data.feeConfig.id } }); }
  });
}
