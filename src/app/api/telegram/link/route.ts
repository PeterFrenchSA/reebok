import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { telegramConfig } from "@/lib/telegram";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/tokens";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "bot:use")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  const link = await prisma.telegramLink.findUnique({ where: { userId: user.id }, select: { telegramUserId: true, createdAt: true } });
  const { enabled, username } = telegramConfig();
  return NextResponse.json({ enabled, username, link }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "bot:use")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(process.env.APP_BASE_URL ?? req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const config = telegramConfig();
  if (!config.enabled) return NextResponse.json({ error: "Telegram has not been configured yet." }, { status: 503 });
  const limit = checkRateLimit({ namespace: "telegram:pair", key: user.id, limit: 5, windowMs: 10 * 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  const token = generateOpaqueToken(); const expiresAt = new Date(Date.now() + 10 * 60000);
  const linked = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(741928, 1)`;
    if (await tx.telegramLink.findUnique({ where: { userId: user.id } })) return true;
    await tx.telegramPairing.upsert({ where: { userId: user.id }, create: { userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt }, update: { tokenHash: hashOpaqueToken(token), expiresAt } });
    return false;
  });
  if (linked) return NextResponse.json({ error: "Disconnect your existing Telegram link first." }, { status: 409 });
  return NextResponse.json({ url: `https://t.me/${config.username}?start=link_${token}`, expiresAt }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "bot:use")) return NextResponse.json({ error: "Member access required." }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(process.env.APP_BASE_URL ?? req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(741928, 1)`;
    const link = await tx.telegramLink.findUnique({ where: { userId: user.id } });
    if (link) await tx.telegramConversation.deleteMany({ where: { telegramUserId: link.telegramUserId } });
    await tx.telegramLink.deleteMany({ where: { userId: user.id } });
    await tx.telegramPairing.deleteMany({ where: { userId: user.id } });
  });
  return NextResponse.json({ ok: true });
}
