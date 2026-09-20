import { NextRequest, NextResponse } from "next/server";
import { telegramConfig, telegramUpdateSchema, validWebhookSecret } from "@/lib/telegram";
import { acceptTelegramUpdate, deliverTelegramUpdate } from "@/lib/telegram-updates";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = telegramConfig();
  if (!config.enabled) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 });
  if (!validWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"), config.secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Missing body." }, { status: 400 });
  let content = ""; let size = 0; const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); return NextResponse.json({ error: "Body too large." }, { status: 413 }); }
    content += decoder.decode(value, { stream: true });
  }
  let raw: unknown;
  try { raw = JSON.parse(content + decoder.decode()); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = telegramUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true }); // Acknowledge unsupported Telegram event shapes.
  const update = parsed.data;
  const sender = update.callback_query?.from ?? update.message?.from;
  if (!sender || sender.is_bot) return NextResponse.json({ ok: true });
  const limit = checkRateLimit({ namespace: "telegram", key: String(sender.id), limit: 40, windowMs: 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  try {
    const stored = await acceptTelegramUpdate(update);
    await deliverTelegramUpdate(stored.id);
    return NextResponse.json({ ok: true });
  } catch {
    // Telegram will retry. Persisted responses avoid repeating state mutations.
    console.error("Telegram update processing or delivery failed.");
    return NextResponse.json({ error: "Retry later." }, { status: 503 });
  }
}
