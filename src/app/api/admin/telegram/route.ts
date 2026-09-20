import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { telegramConfig } from "@/lib/telegram";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "bot:manage")) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const config = telegramConfig();
  return NextResponse.json({ enabled: config.enabled, username: config.username, groups: await prisma.telegramGroup.findMany({ orderBy: { createdAt: "desc" } }), linkedUsers: await prisma.telegramLink.count() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "bot:manage")) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(process.env.APP_BASE_URL ?? req.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const parsed = z.object({ chatId: z.string().regex(/^-\d{1,16}$/), label: z.string().trim().min(1).max(120), enabled: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a negative Telegram group ID, label and enabled state." }, { status: 400 });
  const group = await prisma.telegramGroup.upsert({ where: { chatId: parsed.data.chatId }, create: parsed.data, update: { label: parsed.data.label, enabled: parsed.data.enabled } });
  return NextResponse.json({ group });
}
