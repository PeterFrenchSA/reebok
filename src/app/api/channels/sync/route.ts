import { IntegrationProvider, IntegrationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const syncSchema = z.object({
  provider: z.nativeEnum(IntegrationProvider),
  action: z.enum(["connect", "sync"]),
  accountLabel: z.string().max(120).optional(),
  settings: z.record(z.unknown()).optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Manage bookings permission required" }, { status: 403 });
  }

  const connections = await prisma.channelConnection.findMany({ orderBy: { provider: "asc" } });
  const importedEvents = await prisma.externalCalendarEvent.findMany({
    orderBy: { startDate: "asc" },
    take: 100
  });

  return NextResponse.json({ connections, importedEvents });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Manage bookings permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = syncSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "connect") {
    const connection = await prisma.channelConnection.create({
      data: {
        provider: parsed.data.provider,
        status: IntegrationStatus.CONNECTED,
        accountLabel: parsed.data.accountLabel,
        settings: parsed.data.settings,
        lastSyncStatus: "Connected (credentials stored)."
      }
    });

    return NextResponse.json({ connection }, { status: 201 });
  }

  const updated = await prisma.channelConnection.updateMany({
    where: { provider: parsed.data.provider, status: IntegrationStatus.CONNECTED },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "Sync placeholder complete. Use iCal/API implementation in next iteration."
    }
  });

  return NextResponse.json({
    syncedConnections: updated.count,
    message: "Channel sync endpoint is scaffolded for iCal/API integration in the next iteration."
  });
}
