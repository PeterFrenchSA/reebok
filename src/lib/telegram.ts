import { randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { addDays, bookingHorizon, dateOnly, dateValue, getAvailability, propertyToday } from "@/lib/availability";
import { hasPermission } from "@/lib/rbac";
import { hashOpaqueToken } from "@/lib/tokens";

const numericId = z.number().int().safe();
const chatSchema = z.object({ id: numericId, type: z.enum(["private", "group", "supergroup", "channel"]) });
const senderSchema = z.object({ id: numericId.positive(), is_bot: z.boolean() });
const messageSchema = z.object({ chat: chatSchema, from: senderSchema.optional(), text: z.string().max(4096).optional(), sender_chat: z.unknown().optional(), date: numericId.optional() });
export const telegramUpdateSchema = z.object({
  update_id: numericId.nonnegative(),
  message: messageSchema.optional(),
  callback_query: z.object({ id: z.string().max(256), from: senderSchema, data: z.string().max(64).optional(), message: messageSchema.optional() }).optional()
});
export type TelegramUpdateInput = z.infer<typeof telegramUpdateSchema>;
export type BotReply = {
  method: "sendMessage" | "answerCallbackQuery";
  body: Record<string, unknown>;
  requiresLinkedAccount?: boolean;
};
type Button = { text: string; callback_data?: string; url?: string };
const stateSchema = z.object({ nonce: z.string(), step: z.enum(["ROOMS", "START", "END"]), roomIds: z.array(z.string()).max(50), start: dateOnly.optional() });
type State = z.infer<typeof stateSchema>;

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const username = process.env.TELEGRAM_BOT_USERNAME ?? "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  return { token, username, secret, enabled: Boolean(token && /^[A-Za-z0-9_]{5,32}$/.test(username) && /^[A-Za-z0-9_-]{32,256}$/.test(secret)) };
}

export function validWebhookSecret(value: string | null, expected: string): boolean {
  if (!value || !expected) return false;
  const a = Buffer.from(value); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function telegramCall(method: string, body: Record<string, unknown>) {
  const { token } = telegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const data = await response.json() as { ok?: boolean; result?: unknown };
  // Never include the request URL (which contains the bot token) in logs/errors.
  if (!response.ok || !data.ok) throw new Error("Telegram delivery failed.");
  return data.result;
}

function reply(chatId: number, text: string, buttons?: Button[][]): BotReply {
  return { method: "sendMessage", body: { chat_id: chatId, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } };
}

function home(chatId: number): BotReply {
  return reply(chatId, "Reebok availability\nCheck rooms or the whole house. Pending requests hold their dates. This bot does not create bookings yet.", [[{ text: "Check availability", callback_data: "availability" }]]);
}

export function calendarButtons(month: string, earliest: string, latest: string): Button[][] {
  if (!/^\d{4}-\d{2}$/.test(month) || !dateOnly.safeParse(`${month}-01`).success) return [];
  const first = dateValue(`${month}-01`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const buttons: Button[][] = [[..."MTWTFSS"].map((text) => ({ text, callback_data: "noop" }))];
  let row: Button[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => ({ text: " ", callback_data: "noop" }));
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    row.push({ text: date < earliest || date > latest ? "-" : String(day), callback_data: date < earliest || date > latest ? "noop" : `day:${date}` });
    if (row.length === 7) { buttons.push(row); row = []; }
  }
  if (row.length) buttons.push(row);
  const previous = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  buttons.push([
    ...(previous >= earliest.slice(0, 7) ? [{ text: "Previous", callback_data: `month:${previous}` }] : []),
    ...(next <= latest.slice(0, 7) ? [{ text: "Next", callback_data: `month:${next}` }] : [])
  ]);
  return buttons.filter((row) => row.length);
}

function calendar(chatId: number, state: State, month?: string) {
  const earliest = state.step === "END" && state.start ? addDays(state.start, 1) : propertyToday();
  const latest = state.step === "END" && state.start ? [addDays(state.start, 90), bookingHorizon()].sort()[0] : addDays(bookingHorizon(), -1);
  const displayMonth = month ?? earliest.slice(0, 7);
  return reply(chatId, `${state.step === "END" ? `Check-in: ${state.start}. Choose check-out` : "Choose check-in"}\n${displayMonth} (South Africa dates)\nCalendar buttons select dates, not availability. We check the complete stay next.`, scopedButtons(calendarButtons(displayMonth, earliest, latest), state));
}

function scopedButtons(rows: Button[][], state: State): Button[][] {
  return rows.map((row) => row.map((button) => ({ ...button, callback_data: button.callback_data === "noop" ? "noop" : `${state.nonce}|${button.callback_data}` })));
}

function availabilityText(result: Awaited<ReturnType<typeof getAvailability>>) {
  const label = (item: { available: boolean; pending: boolean; confirmed: boolean }) => item.available ? "Available" : `Unavailable (${[item.pending ? "pending hold" : "", item.confirmed ? "confirmed booking" : ""].filter(Boolean).join(" and ")})`;
  return `${result.startDate} to ${result.endDate} (${result.nights} nights)\n${result.scope === "WHOLE_HOUSE" ? "Whole house" : "Selected rooms"}: ${label(result)}\n\n${result.rooms.map((room) => `${room.name} (sleeps ${room.capacity}): ${label(room)}`).join("\n")}\n\nAvailability is live, not a reservation. Use the website to request a booking.`;
}

export async function processTelegramUpdate(tx: Prisma.TransactionClient, update: TelegramUpdateInput): Promise<BotReply[]> {
  const callback = update.callback_query;
  const message = callback?.message ?? update.message;
  const sender = callback?.from ?? message?.from;
  if (!message || !sender || sender.is_bot || message.sender_chat || message.chat.type === "channel") return [];
  const senderId = String(sender.id); const chatId = message.chat.id;
  const privateChat = message.chat.type === "private" && String(chatId) === senderId;
  const text = (message.text ?? "").trim();
  const config = telegramConfig();
  const command = /^\/(\w+)(?:@([\w]+))?(?:\s+([\s\S]*))?$/.exec(text);
  if (command?.[2] && command[2].toLowerCase() !== config.username.toLowerCase()) return [];
  const rawAction = callback?.data ?? command?.[1]?.toLowerCase() ?? "";
  const [nonce, scopedAction] = rawAction.includes("|") ? rawAction.split("|", 2) : [undefined, undefined];
  const action = scopedAction ?? rawAction;
  const prefix: BotReply[] = callback ? [{ method: "answerCallbackQuery", body: { callback_query_id: callback.id } }] : [];
  let authorized = false;
  const send = (response: BotReply) => [...prefix, { ...response, requiresLinkedAccount: authorized }];
  const portal = `${process.env.APP_BASE_URL?.replace(/\/$/, "") ?? ""}/member/telegram`;

  if (privateChat && action === "start" && /^link_[a-f0-9]{48}$/.test(command?.[3] ?? "")) {
    const pairing = await tx.telegramPairing.findUnique({ where: { tokenHash: hashOpaqueToken(command![3].slice(5)) }, include: { user: true } });
    if (!pairing || pairing.expiresAt <= new Date() || !pairing.user.isActive || !hasPermission(pairing.user.role, "bot:use")) return send(reply(chatId, "This linking code has expired or is invalid. Generate a new link in your member portal."));
    const linked = await tx.telegramLink.findFirst({ where: { OR: [{ userId: pairing.userId }, { telegramUserId: senderId }] } });
    if (linked) return send(reply(chatId, "An account is already linked. Disconnect it in the member portal before linking again."));
    await tx.telegramPairing.delete({ where: { userId: pairing.userId } });
    await tx.telegramLink.create({ data: { userId: pairing.userId, telegramUserId: senderId } });
    authorized = true;
    return send(home(chatId));
  }

  const link = await tx.telegramLink.findUnique({ where: { telegramUserId: senderId }, include: { user: true } });
  if (!link || !link.user.isActive || !hasPermission(link.user.role, "bot:use")) {
    return privateChat ? send(reply(chatId, `Link your active member or admin account first: ${portal}`)) : prefix;
  }
  authorized = true;
  if (!privateChat) {
    if (action === "groupid" && hasPermission(link.user.role, "bot:manage")) return send(reply(chatId, `Group ID: ${chatId}. Approve it in Admin > Telegram.`));
    const group = await tx.telegramGroup.findUnique({ where: { chatId: String(chatId) } });
    if (!group?.enabled || !["availability", "start", "help"].includes(action)) return prefix;
    return send(reply(chatId, "Continue privately to check member availability.", [[{ text: "Open Reebok bot", url: `https://t.me/${config.username}?start=availability` }]]));
  }
  if (action === "cancel") {
    await tx.telegramConversation.deleteMany({ where: { telegramUserId: senderId } });
    return send(reply(chatId, "Selection cancelled. Use /availability to start again."));
  }
  if (action === "noop") return prefix;
  const existing = await tx.telegramConversation.findUnique({ where: { telegramUserId: senderId } });
  if (existing && existing.expiresAt > new Date() && existing.lastUpdateId >= BigInt(update.update_id)) return prefix;
  const parsed = stateSchema.safeParse(existing?.state);
  let state = existing && existing.expiresAt > new Date() && parsed.success ? parsed.data : null;
  if (callback && !["availability", "noop"].includes(action) && (!state || state.nonce !== nonce)) return send(reply(chatId, "This selection is no longer active. Use /availability to start again."));
  const save = async (value: State) => tx.telegramConversation.upsert({ where: { telegramUserId: senderId }, create: { telegramUserId: senderId, state: value, lastUpdateId: BigInt(update.update_id), expiresAt: new Date(Date.now() + 30 * 60000) }, update: { state: value, lastUpdateId: BigInt(update.update_id), expiresAt: new Date(Date.now() + 30 * 60000) } });
  if (action === "availability" || (action === "start" && command?.[3] === "availability")) {
    if (command?.[3] && action === "availability") {
      const dates = command[3].split(/\s+/);
      if (dates.length !== 2) return send(reply(chatId, "Use /availability YYYY-MM-DD YYYY-MM-DD, or /availability for guided room/date selection."));
      try { return send(reply(chatId, availabilityText(await getAvailability(dates[0], dates[1], [], tx)))); }
      catch { return send(reply(chatId, "Choose real dates from today, checkout after check-in, at most 90 nights, within the booking horizon. Use /availability for buttons.")); }
    }
    state = { nonce: randomBytes(4).toString("hex"), step: "ROOMS", roomIds: [] }; await save(state);
  }
  if (state?.step === "ROOMS") {
    const rooms = await tx.room.findMany({ where: { isBookable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, capacity: true } });
    if (action.startsWith("room:")) {
      const id = action.slice(5); if (!rooms.some((r) => r.id === id)) return send(reply(chatId, "That room is unavailable. Start again with /availability."));
      state.roomIds = state.roomIds.includes(id) ? state.roomIds.filter((r) => r !== id) : [...state.roomIds, id];
    }
    if (action === "whole" || (action === "rooms_done" && state.roomIds.length)) {
      state = { nonce: randomBytes(4).toString("hex"), step: "START", roomIds: action === "whole" ? [] : state.roomIds }; await save(state); return send(calendar(chatId, state));
    }
    await save(state);
    return send(reply(chatId, "Choose the whole house, or select rooms then Continue.", scopedButtons([
      [{ text: "Whole house", callback_data: "whole" }],
      ...rooms.map((room) => [{ text: `${state!.roomIds.includes(room.id) ? "[Selected] " : ""}${room.name} (${room.capacity})`, callback_data: `room:${room.id}` }]),
      [{ text: "Continue with selected rooms", callback_data: "rooms_done" }]
    ], state)));
  }
  if (state && action.startsWith("month:")) {
    const month = action.slice(6);
    if (!/^\d{4}-\d{2}$/.test(month) || month < propertyToday().slice(0, 7) || month > bookingHorizon().slice(0, 7)) return prefix;
    await save(state); return send(calendar(chatId, state, month));
  }
  if (state && action.startsWith("day:")) {
    const date = action.slice(4);
    if (!dateOnly.safeParse(date).success || date < propertyToday() || date > bookingHorizon()) return send(reply(chatId, "That date is outside the booking window. Use /availability to restart."));
    if (state.step === "START") {
      state = { ...state, nonce: randomBytes(4).toString("hex"), step: "END", start: date }; await save(state); return send(calendar(chatId, state));
    }
    if (state.step === "END" && state.start) {
      try {
        const result = await getAvailability(state.start, date, state.roomIds, tx);
        await tx.telegramConversation.deleteMany({ where: { telegramUserId: senderId } });
        return send(reply(chatId, availabilityText(result), [[{ text: "Check another stay", callback_data: "availability" }]]));
      } catch { return send(reply(chatId, "Choose checkout after check-in, within 90 nights. If rooms changed, restart with /availability.")); }
    }
  }
  if (action === "start" || action === "help") return send(home(chatId));
  return send(reply(chatId, "Use /availability to choose rooms and dates, /cancel to reset, or /help. I use the booking system directly, not AI. Old selections expire after 30 minutes."));
}
