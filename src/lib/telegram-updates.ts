import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { BotReply, processTelegramUpdate, telegramCall, TelegramUpdateInput } from "@/lib/telegram";

export async function acceptTelegramUpdate(update: TelegramUpdateInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(741928, 1)`;
    const previous = await tx.telegramUpdate.findUnique({ where: { id: BigInt(update.update_id) } });
    if (previous) return previous;
    const sender = update.callback_query?.from ?? update.message?.from;
    const responses = await processTelegramUpdate(tx, update);
    return tx.telegramUpdate.create({ data: {
      id: BigInt(update.update_id), telegramUserId: String(sender?.id ?? ""),
      responses: responses as unknown as Prisma.InputJsonValue
    } });
  }, { maxWait: 10000, timeout: 15000 });
}

export async function deliverTelegramUpdate(id: bigint, send = telegramCall) {
  await prisma.$transaction(async (tx) => {
    const key = `telegram-delivery:${id}`;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const update = await tx.telegramUpdate.findUnique({ where: { id } });
    if (!update || update.delivered) return;
    // A revoked/deactivated link must not receive an older queued availability result.
    const responses = update.responses as unknown as BotReply[];
    const link = await tx.telegramLink.findUnique({ where: { telegramUserId: update.telegramUserId }, include: { user: true } });
    const permitted = Boolean(link?.user.isActive && hasPermission(link.user.role, "bot:use"));
    if (update.createdAt.getTime() > Date.now() - 30 * 60000) {
      for (const response of responses) {
        if (response.requiresLinkedAccount && !permitted) continue;
        if (response.method === "answerCallbackQuery") {
          // Telegram callbacks expire quickly; an expired acknowledgement must not prevent delivery.
          try { await send(response.method, response.body); } catch { /* Reply can still be delivered. */ }
        } else await send(response.method, response.body);
      }
    }
    await tx.telegramUpdate.update({ where: { id }, data: { delivered: true } });
  }, { maxWait: 10000, timeout: 35000 });
}
