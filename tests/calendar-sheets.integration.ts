import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { prisma } from "../src/lib/prisma";
import { addDays, propertyToday, getAvailability } from "../src/lib/availability";
import { ensureSheetsState, SHEETS_SYNC_ID, syncGoogleSheets } from "../src/lib/google-sheets";
import { sheetsSnapshot } from "../src/lib/sheets-snapshot";
import { GoogleSheet, SHEETS_MARKER } from "../src/lib/sheets-report";

export async function testCalendarAndSheets(t: TestContext, base: string, cookies: Record<string, string>, memberId: string, roomA: string, roomB: string) {
  const day = (n: number) => addDays(propertyToday(), n);
  async function api(path: string, role?: string, body?: unknown, method = body ? "POST" : "GET", extraHeaders: Record<string, string> = {}) {
    const response = await fetch(base + path, { method, redirect: "manual", headers: { ...(role ? { cookie: cookies[role] } : {}), "Content-Type": "application/json", ...extraHeaders }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }
  const family = await prisma.booking.create({ data: { source: "INTERNAL", scope: "ROOM_SPECIFIC", status: "PENDING", startDate: new Date(day(220)), endDate: new Date(day(223)), nights: 3, totalGuests: 1, requestedById: memberId, totalAmount: 123, guestBreakdown: { member: 1 }, notes: "PRIVATE calendar notes", manageToken: "PRIVATE token", roomAllocations: { create: { roomId: roomA, guestCount: 1, guestLabel: "PRIVATE room label" } } } });
  const guest = await prisma.booking.create({ data: { source: "EXTERNAL_PUBLIC", scope: "WHOLE_HOUSE", status: "APPROVED", startDate: new Date(day(224)), endDate: new Date(day(225)), nights: 1, totalGuests: 2, externalLeadName: "PRIVATE Guest Name", externalLeadEmail: "private@example.invalid", totalAmount: 345, guestBreakdown: { visitorAdult: 2 } } });
  const rejected = await prisma.booking.create({ data: { source: "INTERNAL", scope: "WHOLE_HOUSE", status: "REJECTED", startDate: new Date(day(220)), endDate: new Date(day(221)), nights: 1, totalGuests: 1, requestedById: memberId, guestBreakdown: { member: 1 } } });
  const cancelled = await prisma.booking.create({ data: { source: "INTERNAL", scope: "WHOLE_HOUSE", status: "CANCELLED", startDate: new Date(day(220)), endDate: new Date(day(221)), nights: 1, totalGuests: 1 } });
  const calendar = `/api/bookings/calendar?start=${day(220)}&end=${day(230)}`;
  await t.test("management calendar enforces roles and shares names without contacts, prices or private references", async () => {
    assert.equal((await api(calendar)).status, 401);
    assert.equal((await api(calendar, "GUEST")).status, 403);
    for (const role of ["FAMILY_MEMBER", "SHAREHOLDER"]) {
      const response = await api(calendar, role);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.data.bookings.length, 2);
      assert.deepEqual(response.data.bookings.map((b: { displayName: string }) => b.displayName), ["FAMILY_MEMBER", "Guest stay"]);
      const text = JSON.stringify(response.data);
      for (const privateField of ["PRIVATE", "private@example", "totalAmount", "currency", "manageToken", "requestedBy", "guestLabel", guest.id, rejected.id]) assert.equal(text.includes(privateField), false, privateField);
      assert.equal(text.includes(family.id), role === "FAMILY_MEMBER");
      assert.equal((await api(`${calendar}&status=ALL`, role)).status, 403);
      assert.equal((await api(`/api/bookings/${family.id}`, role)).status, 403);
    }
    assert.equal((await api(`${calendar}&status=ALL`, "ADMIN")).data.bookings.length, 4);
    assert.match(JSON.stringify((await api(calendar, "ADMIN")).data), /PRIVATE Guest Name/);
    assert.equal((await api(`/api/bookings/calendar?start=${day(220)}&end=${day(300)}`, "ADMIN")).status, 400);
    assert.equal((await api("/api/bookings/calendar?start=2027-02-31&end=2027-03-02", "ADMIN")).status, 400);
    const shared = (await api("/api/bookings", "SHAREHOLDER")).data.bookings.find((b: { displayName: string; startDate: string }) => b.displayName === "FAMILY_MEMBER" && b.startDate.startsWith(day(220)));
    assert.ok(shared); assert.equal(shared.totalAmount, undefined); assert.equal(shared.requestedBy, undefined);
    const admin = await api(`/api/bookings/${family.id}`, "ADMIN");
    assert.equal(admin.status, 200); assert.equal(admin.data.booking.notes, family.notes); assert.equal(admin.data.booking.manageToken, undefined);
    for (const path of ["/member", "/member/calendar", "/member/bookings", "/member/fees", "/member/maintenance", "/member/decisions"]) {
      assert.equal((await api(path, "GUEST")).status, 307, path);
      assert.equal((await api(path, "FAMILY_MEMBER")).status, 200, path);
    }
  });
  await t.test("calendar rescheduling checks conflicts, quote and version, resets approval and preserves audit", async () => {
    const quote = (await api("/api/fees/calculate", "ADMIN", { source: "INTERNAL", startDate: day(228), nights: 2, counts: { member: 1 } })).data;
    const endpoint = `/api/bookings/${family.id}/dates`;
    const body = { startDate: day(228), endDate: day(230), reason: "Family agreed to change travel dates.", expectedUpdatedAt: family.updatedAt.toISOString(), quotedTotal: quote.breakdown.total, quotedFeeConfigId: quote.feeConfigId };
    for (const role of [undefined, "GUEST", "FAMILY_MEMBER", "SHAREHOLDER"]) assert.equal((await api(endpoint, role, body, "PATCH")).status, 403);
    assert.equal((await api(endpoint, "ADMIN", body, "PATCH", { origin: "https://evil.invalid" })).status, 403);
    assert.equal((await api(endpoint, "ADMIN", { ...body, reason: "" }, "PATCH")).status, 400);
    assert.equal((await api(endpoint, "ADMIN", { ...body, quotedTotal: 0 }, "PATCH")).status, 409);
    assert.equal((await api(endpoint, "ADMIN", { ...body, startDate: day(224), endDate: day(226) }, "PATCH")).status, 409);
    assert.equal((await api(endpoint, "ADMIN", body, "PATCH")).status, 200);
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: family.id }, include: { bookingAuditLogs: true } });
    assert.equal(saved.status, "PENDING"); assert.equal(Number(saved.totalAmount), quote.breakdown.total);
    assert.match(saved.bookingAuditLogs[0].comment!, /Family agreed to change/);
    assert.equal((await getAvailability(day(220), day(223), [roomA])).available, true);
    assert.equal((await getAvailability(day(228), day(230), [roomA])).available, false);
    assert.equal((await getAvailability(day(228), day(230), [roomB])).available, true);
    assert.equal((await api(endpoint, "ADMIN", body, "PATCH")).status, 409);
    assert.equal((await api(`/api/bookings/${family.id}/approve`, "ADMIN", { expectedUpdatedAt: body.expectedUpdatedAt })).status, 409);
    assert.equal((await api(`/api/bookings/${family.id}/reject`, "ADMIN", { expectedUpdatedAt: body.expectedUpdatedAt, reason: "Stale rejection" })).status, 409);
    assert.equal((await api(`/api/bookings/${family.id}/approve`, "ADMIN", { expectedUpdatedAt: saved.updatedAt.toISOString() })).status, 200);
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: family.id } });
    assert.equal((await api(endpoint, "ADMIN", { ...body, startDate: day(229), endDate: day(231), expectedUpdatedAt: fresh.updatedAt.toISOString() }, "PATCH")).status, 200);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: family.id } })).approvedAt, null);
  });
  await t.test("own fee view stays personal even with shareholder read-only access", async () => {
    const shareholder = await prisma.user.findUniqueOrThrow({ where: { email: "shareholder@test.invalid" } });
    await prisma.subscription.upsert({ where: { userId: shareholder.id }, create: { userId: shareholder.id, monthlyAmount: 456 }, update: {} });
    const own = await api("/api/subscriptions?mineOnly=true", "SHAREHOLDER");
    assert.equal(own.data.subscriptions.length, 1); assert.equal(own.data.subscriptions[0].userId, shareholder.id);
    assert.ok((await api("/api/subscriptions", "SHAREHOLDER")).data.subscriptions.length > 1);
  });
  const target = "isolated_test_sheet_1234567890";
  await t.test("Sheets settings are admin-only, versioned, secret-free and fail safely before configuration", async () => {
    for (const role of [undefined, "GUEST", "FAMILY_MEMBER", "SHAREHOLDER"]) {
      for (const method of ["GET", "PUT", "POST"]) assert.equal((await api("/api/admin/google-sheets", role, method === "GET" ? undefined : {}, method)).status, 403);
      assert.equal((await api("/admin/integrations", role)).status, 307);
    }
    const result = await api("/api/admin/google-sheets", "ADMIN");
    assert.equal(result.status, 200); assert.equal(result.data.credentials.configured, false);
    assert.equal(result.data.state.leaseToken, undefined); assert.equal(result.data.credentials.key, undefined);
    const body = { spreadsheet: target, enabled: false, version: result.data.state.version, acknowledgeSharing: false };
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", body, "PUT", { origin: "https://evil.invalid" })).status, 403);
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", { ...body, enabled: true }, "PUT")).status, 400);
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", { ...body, enabled: true, acknowledgeSharing: true }, "PUT")).status, 503);
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", body, "PUT")).status, 200);
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", body, "PUT")).status, 409);
    assert.equal((await api("/api/admin/google-sheets", "ADMIN", {}, "POST")).data.skipped, "disabled");
    assert.equal((await api("/api/jobs/google-sheets", undefined, {}, "POST")).status, 401);
    assert.equal((await api("/api/jobs/google-sheets", undefined, {}, "POST", { "x-cron-secret": "incorrect" })).status, 401);
    assert.equal((await api("/api/jobs/google-sheets", undefined, {}, "POST", { "x-cron-secret": process.env.CRON_SECRET! })).data.skipped, "disabled");
    assert.ok((await ensureSheetsState()).lastSchedulerAt);
  });
  await t.test("Sheets snapshot retains all history and uses a single atomic safe batch", async () => {
    await prisma.expense.create({ data: { title: '=IMPORTXML("unsafe")', category: "OTHER", amount: 98, invoiceFileUrl: "/uploads/private-invoice.pdf", description: "PRIVATE invoice notes" } });
    const tabs = await sheetsSnapshot();
    assert.equal(tabs.length, 5);
    const report = tabs.find((tab) => tab.key === "bookings")!;
    for (const id of [family.id, guest.id, rejected.id, cancelled.id]) assert.ok(report.rows.some((row) => row[0] === id));
    const serialized = JSON.stringify(tabs);
    for (const secret of ["PRIVATE", "private@example.invalid", "private-invoice.pdf", "manageToken", "passwordHash"]) assert.equal(serialized.includes(secret), false, secret);
    await prisma.googleSheetsSync.update({ where: { id: SHEETS_SYNC_ID }, data: { enabled: true, spreadsheetId: target } });
    let writes = 0;
    const transport = { read: async () => [{ properties: { title: "My separate notes", sheetId: 9 } }], write: async (id: string, batch: unknown) => {
      assert.equal(id, target); assert.equal(JSON.stringify(batch).includes('"sheetId":9'), false); writes++;
    } };
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: family.id } });
    const result = await syncGoogleSheets({ manual: true, transport });
    assert.equal(result.synced, true); assert.equal(writes, 1);
    assert.equal((await syncGoogleSheets({ transport })).skipped, "not-due");
    assert.deepEqual(await prisma.booking.findUniqueOrThrow({ where: { id: family.id } }), before);
    const success = await ensureSheetsState();
    assert.ok(success.lastSuccessAt); assert.equal(success.leaseToken, null);
    await assert.rejects(syncGoogleSheets({ manual: true, transport: { ...transport, write: async () => { throw new Error("PRIVATE credential diagnostic"); } } }), /could not be confirmed/);
    const failed = await ensureSheetsState();
    assert.equal(failed.lastSuccessAt?.getTime(), success.lastSuccessAt?.getTime()); assert.equal(failed.failureCount, 1); assert.equal(failed.leaseToken, null);
    assert.equal(failed.lastError?.includes("PRIVATE"), false); assert.ok(failed.nextAttemptAt! > new Date());
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => { began = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = syncGoogleSheets({ manual: true, transport: { ...transport, write: async () => { began(); await held; } } });
    try {
      await started;
      assert.equal((await syncGoogleSheets({ manual: true, transport })).skipped, "busy");
      assert.equal((await api("/api/admin/google-sheets", "ADMIN", { spreadsheet: target, version: failed.version, enabled: false }, "PUT")).status, 409);
    } finally { release(); await first; }
    assert.equal((await ensureSheetsState()).failureCount, 0);
    const unowned: GoogleSheet[] = [{ properties: { title: "Reebok - Bookings", sheetId: 1 }, developerMetadata: [{ metadataKey: SHEETS_MARKER, metadataValue: "different" }] }];
    await assert.rejects(syncGoogleSheets({ manual: true, transport: { ...transport, read: async () => unowned } }), /not owned/);
    assert.equal(writes, 1);
    await prisma.googleSheetsSync.update({ where: { id: SHEETS_SYNC_ID }, data: { nextAttemptAt: null } });
    assert.equal((await api("/api/jobs/google-sheets", undefined, {}, "POST", { "x-cron-secret": process.env.CRON_SECRET! })).status, 503);
    await prisma.googleSheetsSync.update({ where: { id: SHEETS_SYNC_ID }, data: { enabled: false } });
  });
}
