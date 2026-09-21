import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { addDays, getAvailability, propertyToday } from "../src/lib/availability";
import { acceptTelegramUpdate, deliverTelegramUpdate } from "../src/lib/telegram-updates";
import { BotReply, TelegramUpdateInput } from "../src/lib/telegram";
import { hashOpaqueToken } from "../src/lib/tokens";

const database = new URL(process.env.TEST_DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.pathname !== "/reebok_bot_test" || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("Use the isolated integration test runner, never a real database.");
const base = "http://127.0.0.1:3119";
let updateId = 100;
function update(user: number, text: string, chat = user): TelegramUpdateInput {
  return { update_id: updateId++, message: { chat: { id: chat, type: chat === user ? "private" : "supergroup" }, from: { id: user, is_bot: false }, text } };
}
async function bot(input: TelegramUpdateInput) {
  const stored = await acceptTelegramUpdate(input);
  return stored.responses as unknown as BotReply[];
}
const texts = (replies: BotReply[]) => replies.map((r) => r.body.text ?? "").join("\n");
const buttonData = (replies: BotReply[], text: string) => {
  for (const reply of replies) {
    const keyboard = reply.body.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } | undefined;
    for (const row of keyboard?.inline_keyboard ?? []) for (const button of row) if (button.text.includes(text)) return button.callback_data;
  }
  throw Error(`Button not found: ${text}`);
};
const callback = (user: number, data: string): TelegramUpdateInput => ({ update_id: updateId++, callback_query: { id: `callback-${updateId}`, from: { id: user, is_bot: false }, data, message: { chat: { id: user, type: "private" } } } });
async function api(path: string, cookie?: string, body?: unknown, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}

test("production HTTP and database integration (no external Telegram or SMTP requests)", { timeout: 120000 }, async (t) => {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "-p", "3119"], { env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout?.on("data", (chunk) => { output += chunk; }); server.stderr?.on("data", (chunk) => { output += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) { if (server.exitCode !== null) throw Error(output); if (output.includes("Ready")) { await fetch(base + "/login"); ready = true; break; } await new Promise((r) => setTimeout(r, 250)); }
    assert.ok(ready, output);
    await t.test("deployment health checks the database and identifies the running release", async () => {
      const response = await api("/api/health");
      assert.equal(response.status, 200);
      assert.deepEqual(response.data, { ok: true, release: "isolated-integration-test" });
      assert.match(response.headers.get("cache-control")!, /no-store/);
    });
    await t.test("fresh installation creates an explicit administrator, never overwriting accounts", async () => {
      const env = { ...process.env, BOOTSTRAP_ADMIN_EMAIL: "bootstrap@test.invalid", BOOTSTRAP_ADMIN_NAME: "Fresh Administrator", BOOTSTRAP_ADMIN_PASSWORD: "Strong-test-only-password-123" };
      const run = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/create-admin.ts"], { env, encoding: "utf8" });
      assert.equal(run().status, 0);
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: env.BOOTSTRAP_ADMIN_EMAIL } });
      assert.equal(admin.role, "SUPER_ADMIN");
      assert.equal(admin.name, "Fresh Administrator");
      assert.equal(await prisma.user.count(), 1);
      assert.equal(await prisma.booking.count(), 0);
      assert.equal(await prisma.room.count(), 0);
      assert.equal(await prisma.feeConfig.count(), 0);
      assert.notEqual(admin.passwordHash, env.BOOTSTRAP_ADMIN_PASSWORD);
      const login = await api("/api/auth/login", undefined, { email: env.BOOTSTRAP_ADMIN_EMAIL, password: env.BOOTSTRAP_ADMIN_PASSWORD });
      assert.equal(login.status, 200);
      assert.equal((await api("/admin", login.headers.get("set-cookie")!.split(";")[0])).status, 200);
      assert.equal(run().status, 1);
      await prisma.user.delete({ where: { id: admin.id } });
    });
    const users = await Promise.all((["SUPER_ADMIN", "ADMIN", "SHAREHOLDER", "FAMILY_MEMBER", "GUEST"] as const).map((role) => prisma.user.create({ data: { role, email: `${role.toLowerCase()}@test.invalid`, name: role, passwordHash: hashPassword("Test-only-password-123") } })));
    const cookies: Record<string, string> = {};
    for (const user of users) {
      const login = await api("/api/auth/login", undefined, { email: user.email, password: "Test-only-password-123" });
      assert.equal(login.status, 200); cookies[user.role] = login.headers.get("set-cookie")!.split(";")[0];
    }
    const member = users.find((u) => u.role === "FAMILY_MEMBER")!;
    const roomA = await prisma.room.create({ data: { name: "Room A", code: "A", capacity: 2 } });
    const roomB = await prisma.room.create({ data: { name: "Room B", code: "B", capacity: 2 } });
    await prisma.feeConfig.create({ data: {} });
    const day = (n: number) => addDays(propertyToday(), n);
    const create = (start: number, end: number, roomId?: string) => api("/api/bookings", cookies.FAMILY_MEMBER, { source: "INTERNAL", scope: roomId ? "ROOM_SPECIFIC" : "WHOLE_HOUSE", startDate: day(start), endDate: day(end), guestBreakdown: { member: 1 }, roomAllocations: roomId ? [{ roomId, guestCount: 1 }] : undefined });

    await t.test("role boundaries and safe production login", async () => {
      assert.equal((await api("/api/admin/telegram", cookies.SHAREHOLDER)).status, 403);
      assert.equal((await api("/api/admin/telegram", cookies.ADMIN)).status, 200);
      assert.equal((await api("/api/expenses", cookies.SHAREHOLDER)).status, 200);
      assert.equal((await api("/api/expenses", cookies.SHAREHOLDER, { title: "Not allowed", amount: 5 })).status, 403);
      assert.equal((await api("/api/finance/import", cookies.SHAREHOLDER, { entity: "expenses", format: "csv", data: "title,amount\nNo,5" })).status, 403);
      assert.equal((await api("/member/finances", cookies.SHAREHOLDER)).status, 200);
      assert.equal((await api("/member/finances", cookies.FAMILY_MEMBER)).status, 307);
      assert.equal((await api("/api/telegram/link", cookies.GUEST)).status, 403);
      assert.equal((await api("/api/v1/availability?startDate=" + day(1) + "&endDate=" + day(2), cookies.GUEST)).status, 403);
      assert.equal(String((await api("/login")).data).includes("admin1234"), false);
    });
    await t.test("different rooms may overlap; whole house and same rooms cannot", async () => {
      const a = await create(10, 12, roomA.id); assert.equal(a.status, 200, JSON.stringify(a.data));
      assert.equal((await create(10, 12, roomB.id)).status, 200);
      assert.equal((await create(10, 12, roomA.id)).status, 409);
      assert.equal((await create(10, 12)).status, 409);
      assert.equal((await create(12, 13, roomA.id)).status, 200);
      const available = await getAvailability(day(10), day(12));
      assert.equal(available.available, false); assert.equal(available.pending, true);
      assert.equal(JSON.stringify(available).includes(member.email), false);
      assert.equal((await api(`/api/bookings/${a.data.booking.id}/approve`, cookies.ADMIN, {})).status, 200);
      assert.equal((await getAvailability(day(10), day(12))).confirmed, true);
      assert.equal((await api(`/api/bookings/${a.data.booking.id}/reject`, cookies.ADMIN, { reason: "Test release" })).status, 200);
      assert.equal((await getAvailability(day(10), day(12), [roomA.id])).available, true);
      assert.equal((await api(`/api/bookings/${a.data.booking.id}/approve`, cookies.ADMIN, {})).status, 409);
    });
    await t.test("simultaneous writes reserve exactly once", async () => {
      const responses = await Promise.all([create(20, 22), create(20, 22)]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    });
    await t.test("authenticated availability validates dates and never exposes booking identities", async () => {
      const path = `/api/v1/availability?startDate=${day(10)}&endDate=${day(12)}&roomId=${roomB.id}`;
      assert.equal((await api(path)).status, 401);
      const result = await api(path, cookies.FAMILY_MEMBER);
      assert.equal(result.status, 200);
      assert.equal(result.data.available, false);
      assert.equal(result.data.pending, true);
      assert.match(result.headers.get("cache-control")!, /no-store/);
      assert.equal(JSON.stringify(result.data).includes(member.email), false);
      assert.equal((await api(`/api/v1/availability?startDate=${day(10)}&endDate=${day(10)}`, cookies.FAMILY_MEMBER)).status, 400);
      assert.equal((await api(`/api/v1/availability?startDate=${day(550)}&endDate=${day(551)}`, cookies.FAMILY_MEMBER)).status, 400);
      assert.equal((await api(path + "&roomId=unknown", cookies.FAMILY_MEMBER)).status, 400);
    });
    await t.test("booking edits preserve member pricing and cannot overlap; imports roll back conflicts", async () => {
      const original = await create(60, 62);
      assert.equal(original.status, 200);
      const booking = original.data.booking;
      const edit = { reference: booking.id, startDate: day(60), endDate: day(62), totalGuests: 1, notes: "Updated note" };
      const note = await api("/api/bookings/manage", cookies.FAMILY_MEMBER, edit, "PATCH");
      assert.equal(note.status, 200, JSON.stringify(note.data));
      assert.equal(Number(note.data.booking.totalAmount), Number(booking.totalAmount));
      const extended = await api("/api/bookings/manage", cookies.FAMILY_MEMBER, { ...edit, endDate: day(63) }, "PATCH");
      assert.equal(extended.status, 200, JSON.stringify(extended.data));
      assert.equal(Number(extended.data.booking.totalAmount), Number(booking.totalAmount) * 1.5);
      assert.equal((await create(64, 66)).status, 200);
      assert.equal((await api("/api/bookings/manage", cookies.FAMILY_MEMBER, { ...edit, endDate: day(65) }, "PATCH")).status, 409);
      const before = await prisma.booking.count();
      const imported = await api("/api/finance/import", cookies.ADMIN, { entity: "bookings", format: "csv", data: `startDate,endDate,status\n${day(70)},${day(72)},PENDING\n${day(61)},${day(62)},APPROVED` });
      assert.equal(imported.status, 409);
      assert.equal(await prisma.booking.count(), before);
    });
    await t.test("invalid room allocations and mismatched pricing are rejected", async () => {
      const payload = { source: "INTERNAL", scope: "ROOM_SPECIFIC", startDate: day(30), endDate: day(32), guestBreakdown: { member: 3 } };
      assert.equal((await api("/api/bookings", cookies.FAMILY_MEMBER, payload)).status, 400);
      assert.equal((await api("/api/bookings", cookies.FAMILY_MEMBER, { ...payload, roomAllocations: [{ roomId: roomA.id, guestCount: 3 }] })).status, 400);
      assert.equal((await api("/api/bookings", undefined, { startDate: day(30), endDate: day(32), guests: [{ fullName: "Test", guestType: "VISITOR_ADULT" }] })).status, 400);
    });
    await t.test("anonymous reference/email no longer grants access; feedback stays private pending review", async () => {
      const b = await create(40, 42); assert.equal(b.status, 200);
      assert.equal((await api(`/api/bookings/manage?reference=${b.data.booking.id}&email=${member.email}`)).status, 404);
      const feedback = await api("/api/feedback", cookies.FAMILY_MEMBER, { bookingId: b.data.booking.id, message: "Synthetic feedback", isPublished: true });
      assert.equal(feedback.data.feedback.isPublished, false);
      await api("/api/feedback", cookies.ADMIN, { id: feedback.data.feedback.id, isPublished: true }, "PATCH");
      const feed = await api("/api/feedback"); assert.equal(JSON.stringify(feed.data).includes(member.email), false); assert.equal(JSON.stringify(feed.data).includes(b.data.booking.id), false);
      const exported = await api("/api/finance/export?entity=bookings", cookies.SHAREHOLDER);
      assert.equal(exported.status, 200); assert.equal(exported.data.includes("manageToken"), false);
      await prisma.payment.create({ data: { payerId: member.id, amount: 100, method: "MANUAL_PROOF", gatewayPayload: { privateGatewayData: "must-not-leak" } } });
      assert.equal(JSON.stringify((await api("/api/payments", cookies.SHAREHOLDER)).data).includes("must-not-leak"), false);
      assert.equal((await api("/api/bookings/manage", undefined, { reference: b.data.booking.id, email: member.email })).status, 503);
    });
    await t.test("single-use pairing, model-free conversation, and duplicate delivery", async () => {
      const pairing = await api("/api/telegram/link", cookies.FAMILY_MEMBER, {}); assert.equal(pairing.status, 200);
      const token = new URL(pairing.data.url).searchParams.get("start")!;
      assert.match((await prisma.telegramPairing.findUniqueOrThrow({ where: { userId: member.id } })).tokenHash, /^sha256:/);
      const input = update(501, `/start ${token}`);
      assert.match(texts(await bot(input)), /Reebok availability/);
      assert.deepEqual(await bot(input), await bot(input));
      assert.match(texts(await bot(update(502, `/start ${token}`))), /expired or is invalid/);
      let sends = 0; const send = async () => { sends++; };
      await deliverTelegramUpdate(BigInt(input.update_id), send); await deliverTelegramUpdate(BigInt(input.update_id), send); assert.equal(sends, 1);
      const start = await bot(update(501, "/availability"));
      const rooms = await bot(callback(501, buttonData(start, "Room B")));
      const arrival = await bot(callback(501, buttonData(rooms, "Continue")));
      assert.match(texts(arrival), /Choose check-in/);
      const state = (await prisma.telegramConversation.findUniqueOrThrow({ where: { telegramUserId: "501" } })).state as { nonce: string };
      const checkout = await bot(callback(501, `${state.nonce}|day:${day(50)}`)); assert.match(texts(checkout), /Choose check-out/);
      const nextState = (await prisma.telegramConversation.findUniqueOrThrow({ where: { telegramUserId: "501" } })).state as { nonce: string };
      assert.match(texts(await bot(callback(501, `${state.nonce}|day:${day(51)}`))), /no longer active/);
      const result = await bot(callback(501, `${nextState.nonce}|day:${day(52)}`)); assert.match(texts(result), /Selected rooms: Available/);
      assert.match(texts(await bot(update(501, "/availability sometime next weekend"))), /Use \/availability/);
    });
    await t.test("approved groups still require linked senders and return only a private-chat handoff", async () => {
      assert.deepEqual(await bot(update(501, "/availability", -100123)), []);
      assert.equal((await api("/api/admin/telegram", cookies.ADMIN, { chatId: "-100123", label: "Family", enabled: true })).status, 200);
      assert.match(texts(await bot(update(501, "/availability", -100123))), /Continue privately/);
      assert.deepEqual(await bot(update(999, "/availability", -100123)), []);
      await api("/api/admin/telegram", cookies.ADMIN, { chatId: "-100123", label: "Family", enabled: false });
      assert.deepEqual(await bot(update(501, "/availability", -100123)), []);
    });
    await t.test("deactivation, unlinking, expired pairing and forged webhook", async () => {
      const queued = await acceptTelegramUpdate(update(501, `/availability ${day(80)} ${day(82)}`));
      await prisma.user.update({ where: { id: member.id }, data: { isActive: false } });
      let delivered = 0;
      await deliverTelegramUpdate(queued.id, async () => { delivered++; });
      assert.equal(delivered, 0, "Revoked users must not receive queued results");
      assert.match(texts(await bot(update(501, "/availability"))), /Link your active/);
      await prisma.user.update({ where: { id: member.id }, data: { isActive: true } });
      assert.equal((await api("/api/telegram/link", cookies.FAMILY_MEMBER, undefined, "DELETE")).status, 200);
      assert.equal(await prisma.telegramLink.count({ where: { userId: member.id } }), 0);
      const token = "a".repeat(48);
      await prisma.telegramPairing.create({ data: { userId: member.id, tokenHash: hashOpaqueToken(token), expiresAt: new Date(0) } });
      assert.match(texts(await bot(update(501, `/start link_${token}`))), /expired or is invalid/);
      assert.equal((await api("/api/telegram/webhook", undefined, update(501, "/availability"))).status, 401);
    });
    await t.test("signed webhook rejects malformed/oversized bodies and safely acknowledges replay", async () => {
      const headers = { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET! };
      const post = (body: string) => fetch(base + "/api/telegram/webhook", { method: "POST", headers, body });
      assert.equal((await post("{")).status, 400);
      assert.equal((await post("x".repeat(65537))).status, 413);
      const ignored = update(999, "/availability", -100999);
      assert.equal((await post(JSON.stringify(ignored))).status, 200);
      assert.equal((await post(JSON.stringify(ignored))).status, 200);
      assert.equal(await prisma.telegramUpdate.count({ where: { id: BigInt(ignored.update_id) } }), 1);
      assert.equal((await prisma.telegramUpdate.findUniqueOrThrow({ where: { id: BigInt(ignored.update_id) } })).delivered, true);
    });
  } finally {
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
    await prisma.$disconnect();
  }
});
