import { MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const createTaskSchema = z.object({
  assetId: z.string().optional(),
  title: z.string().min(3).max(160),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(MaintenancePriority).default(MaintenancePriority.MEDIUM),
  dueDate: z.coerce.date().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  assignedToId: z.string().optional(),
  recurrenceRule: z.string().max(180).optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "maintenance:view")) {
    return NextResponse.json({ error: "Maintenance view permission required" }, { status: 403 });
  }

  const statusFilter = req.nextUrl.searchParams.get("status") as MaintenanceStatus | null;

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      status: statusFilter && Object.values(MaintenanceStatus).includes(statusFilter)
        ? statusFilter
        : undefined
    },
    include: {
      asset: true,
      assignedTo: { select: { id: true, name: true, email: true } }
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "maintenance:edit")) {
    return NextResponse.json({ error: "Maintenance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = createTaskSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.maintenanceTask.create({
    data: {
      ...parsed.data,
      createdById: user.id,
      status: MaintenanceStatus.OPEN
    }
  });

  return NextResponse.json({ task }, { status: 201 });
}
