import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { prisma } from "../src/lib/prisma";
import { addDays, propertyToday } from "../src/lib/availability";
import { hashBookingManageToken } from "../src/lib/booking-manage";

export async function testStayLimits(t: TestContext, base: string, cookies: Record<string, string>, memberId: string, roomId: string) {
  const day = (n: number) => addDays(propertyToday(), n);
  async function api(path: string, role?: string, body?: unknown, method = body ? "POST" : "GET") {
    const response = await fetch(base + path, { method, redirect: "manual", headers: { ...(role ? { cookie: cookies[role] } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  const payload = { source: "INTERNAL", scope: "WHOLE_HOUSE", startDate: day(300), endDate: day(310), guestBreakdown: { member: 1 } };
  const quote = (source: string, nights: number, start = day(300), role = "ADMIN") => api("/api/fees/calculate", role, { source, nights, startDate: start, counts: source === "INTERNAL" ? { member: 1 } : { visitorAdult: 1 } });

  await t.test("all member-capable roles have a ten-night room and whole-house cap, including quotes", async () => {
    for (const role of ["FAMILY_MEMBER", "SHAREHOLDER", "ADMIN", "SUPER_ADMIN"]) {
      assert.equal((await quote("INTERNAL", 10, day(300), role)).status, 200);
      const refusedQuote = await quote("INTERNAL", 11, day(300), role);
      assert.equal(refusedQuote.status, 400); assert.match(refusedQuote.data.error, /10 nights/);
      for (const scope of ["ROOM_SPECIFIC", "WHOLE_HOUSE"]) {
        const body = { ...payload, scope, roomAllocations: scope === "ROOM_SPECIFIC" ? [{ roomId, guestCount: 1 }] : [] };
        const before = await prisma.booking.count();
        const refused = await api("/api/bookings", role, { ...body, endDate: day(311) });
        assert.equal(refused.status, 400); assert.match(refused.data.error, /10 nights/);
        assert.equal(await prisma.booking.count(), before);
        const accepted = await api("/api/bookings", role, body);
        assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
        try { assert.equal(accepted.data.booking.nights, 10); }
        finally { await prisma.booking.delete({ where: { id: accepted.data.booking.id } }); }
      }
    }
    assert.equal((await api(`/api/v1/availability?startDate=${day(300)}&endDate=${day(310)}`, "FAMILY_MEMBER")).status, 200);
    assert.equal((await api(`/api/v1/availability?startDate=${day(300)}&endDate=${day(311)}`, "FAMILY_MEMBER")).status, 400);
  });

  await t.test("guest create, edit, approval and admin rescheduling retain ninety nights", async () => {
    const guestQuote = await quote("EXTERNAL_PUBLIC", 90);
    assert.equal(guestQuote.status, 200);
    assert.equal((await quote("EXTERNAL_PUBLIC", 91)).status, 400);
    const body = { ...payload, source: "EXTERNAL_PUBLIC", guestBreakdown: { visitorAdult: 1 }, endDate: day(390) };
    assert.equal((await api("/api/bookings", "GUEST", { ...body, endDate: day(391) })).status, 400);
    const created = await api("/api/bookings", "GUEST", body);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const id = created.data.booking.id;
    try {
      assert.equal(created.data.booking.nights, 90);
      assert.equal((await api(`/api/bookings/${id}/approve`, "ADMIN", {})).status, 200);
      const edit = { reference: id, startDate: day(300), endDate: day(390), totalGuests: 1 };
      assert.equal((await api("/api/bookings/manage", "GUEST", { ...edit, endDate: day(391) }, "PATCH")).status, 400);
      assert.equal((await api("/api/bookings/manage", "GUEST", edit, "PATCH")).status, 200);
      const current = await prisma.booking.findUniqueOrThrow({ where: { id } });
      const updatedQuote = await quote("EXTERNAL_PUBLIC", 90, day(301));
      const result = await api(`/api/bookings/${id}/dates`, "ADMIN", { startDate: day(301), endDate: day(391), reason: "Guest agrees to revised travel dates.", expectedUpdatedAt: current.updatedAt.toISOString(), quotedTotal: updatedQuote.data.breakdown.total, quotedFeeConfigId: updatedQuote.data.feeConfigId }, "PATCH");
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id } })).nights, 90);
    } finally { await prisma.booking.delete({ where: { id } }); }
  });

  await t.test("stored member source prevents owner, token and admin date-change bypasses", async () => {
    const created = await api("/api/bookings", "FAMILY_MEMBER", payload);
    assert.equal(created.status, 200);
    const id = created.data.booking.id;
    try {
      const token = "isolated-ten-night-test-management-token";
      await prisma.booking.update({ where: { id }, data: { manageToken: hashBookingManageToken(token) } });
      const original = await prisma.booking.findUniqueOrThrow({ where: { id } });
      const edit = { reference: id, startDate: day(300), endDate: day(311), totalGuests: 1, source: "EXTERNAL_PUBLIC" };
      for (const role of ["FAMILY_MEMBER", "ADMIN", "SUPER_ADMIN", undefined]) {
        const result = await api("/api/bookings/manage", role, { ...edit, ...(role ? {} : { token }) }, "PATCH");
        assert.equal(result.status, 400); assert.match(result.data.error, /10 nights/);
      }
      const estimate = await quote("INTERNAL", 10);
      const change = { startDate: day(301), endDate: day(312), reason: "Family asks for a longer stay.", expectedUpdatedAt: original.updatedAt.toISOString(), quotedTotal: estimate.data.breakdown.total, quotedFeeConfigId: estimate.data.feeConfigId };
      assert.equal((await api(`/api/bookings/${id}/dates`, "ADMIN", change, "PATCH")).status, 400);
      assert.deepEqual(await prisma.booking.findUniqueOrThrow({ where: { id } }), original);
      assert.equal((await api(`/api/bookings/${id}/dates`, "ADMIN", { ...change, endDate: day(311) }, "PATCH")).status, 200);
      assert.equal((await api(`/api/bookings/${id}/approve`, "ADMIN", {})).status, 200);
    } finally { await prisma.booking.delete({ where: { id } }); }
  });

  await t.test("long existing records remain intact but cannot be approved or converted to member rates", async () => {
    const guest = await prisma.booking.create({ data: { source: "EXTERNAL_PUBLIC", scope: "WHOLE_HOUSE", status: "APPROVED", startDate: new Date(day(300)), endDate: new Date(day(311)), nights: 11, totalGuests: 1, requestedById: memberId, guestBreakdown: { visitorAdult: 1 } } });
    const legacy = await prisma.booking.create({ data: { source: "INTERNAL", scope: "WHOLE_HOUSE", status: "PENDING", startDate: new Date(day(320)), endDate: new Date(day(331)), nights: 11, totalGuests: 1, requestedById: memberId, guestBreakdown: { member: 1 } } });
    try {
      const result = await api(`/api/bookings/${guest.id}/accommodation`, "ADMIN", { scope: "ROOM_SPECIFIC", roomAllocations: [{ roomId, guestCount: 1 }], guestBreakdown: { member: 1 }, reason: "Attempt to convert a long guest stay.", expectedUpdatedAt: guest.updatedAt.toISOString(), quotedTotal: 0, quotedFeeConfigId: "test-only" }, "PATCH");
      assert.equal(result.status, 400); assert.match(result.data.error, /10 nights/);
      assert.equal((await api(`/api/bookings/${legacy.id}/approve`, "SUPER_ADMIN", {})).status, 400);
      assert.equal((await api(`/api/bookings/manage?reference=${legacy.id}`, "FAMILY_MEMBER")).status, 200);
      assert.deepEqual(await prisma.booking.findUniqueOrThrow({ where: { id: guest.id } }), guest);
      assert.deepEqual(await prisma.booking.findUniqueOrThrow({ where: { id: legacy.id } }), legacy);
      assert.equal((await api(`/api/bookings/${legacy.id}/reject`, "ADMIN", { reason: "Family will shorten the request." })).status, 200);
    } finally { await prisma.booking.deleteMany({ where: { id: { in: [guest.id, legacy.id] } } }); }
  });

  await t.test("active member imports cannot bypass the cap; past history and guest limits are preserved", async () => {
    const header = "source,status,startDate,endDate,totalGuests,notes";
    const row = (source: string, start: number, end: number) => `${source},APPROVED,${day(start)},${day(end)},1,stay-limit-test`;
    const submit = (rows: string[]) => api("/api/finance/import", "ADMIN", { entity: "bookings", format: "csv", data: [header, ...rows].join("\n") });
    const before = await prisma.booking.count();
    assert.equal((await submit([row("INTERNAL", 300, 310), row("INTERNAL", 320, 331)])).status, 400);
    assert.equal(await prisma.booking.count(), before, "Import must roll back its earlier rows too");
    assert.equal((await submit([row("INTERNAL", -3, 8)])).status, 400);
    try {
      assert.equal((await submit([row("INTERNAL", -60, -15)])).status, 200);
      assert.equal((await submit([row("EXTERNAL_PUBLIC", 300, 390)])).status, 200);
      assert.equal((await submit([row("EXTERNAL_PUBLIC", 400, 491)])).status, 400);
    } finally { await prisma.booking.deleteMany({ where: { notes: "stay-limit-test" } }); }
  });
}
