import { MaintenancePriority, MaintenanceStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const documentUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Document URL must be absolute or root-relative.");

const createTaskSchema = z.object({
  id: z.string().optional(),
  assetId: z.string().optional(),
  title: z.string().min(3).max(160),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(MaintenancePriority).default(MaintenancePriority.MEDIUM),
  dueDate: z.coerce.date().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  assignedToId: z.string().optional(),
  recurrenceRule: z.string().max(180).optional(),
  invoiceFileUrl: documentUrlSchema.optional()
});

const updateTaskSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(MaintenanceStatus).optional(),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  dueDate: z.coerce.date().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  assignedToId: z.string().optional(),
  recurrenceRule: z.string().max(180).optional(),
  invoiceFileUrl: documentUrlSchema.optional()
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
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } }
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 300
  });

  return NextResponse.json({
    tasks,
    currentUser: { id: user.id, role: user.role }
  });
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
      assetId: parsed.data.assetId,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate,
      estimatedCost: parsed.data.estimatedCost,
      assignedToId: parsed.data.assignedToId,
      recurrenceRule: parsed.data.recurrenceRule,
      invoiceFileUrl: parsed.data.invoiceFileUrl,
      createdById: user.id,
      status: MaintenanceStatus.OPEN
    }
  });

  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "maintenance:edit")) {
    return NextResponse.json({ error: "Maintenance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = updateTaskSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.maintenanceTask.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      createdById: true,
      status: true
    }
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const isAdmin = hasPermission(user.role, "booking:manage");
  if (!isAdmin) {
    if (task.createdById !== user.id) {
      return NextResponse.json({ error: "You can only update your own maintenance tasks." }, { status: 403 });
    }
    if (
      parsed.data.status &&
      parsed.data.status !== MaintenanceStatus.OPEN &&
      parsed.data.status !== task.status
    ) {
      return NextResponse.json({ error: "Only admins can approve, complete, or reject tasks." }, { status: 403 });
    }
  }

  const updateData: {
    status?: MaintenanceStatus;
    description?: string;
    priority?: MaintenancePriority;
    dueDate?: Date;
    estimatedCost?: number;
    actualCost?: number;
    assignedToId?: string | null;
    recurrenceRule?: string;
    invoiceFileUrl?: string;
    completedAt?: Date | null;
  } = {};

  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === MaintenanceStatus.DONE) {
      updateData.completedAt = new Date();
    } else if (parsed.data.status === MaintenanceStatus.OPEN || parsed.data.status === MaintenanceStatus.IN_PROGRESS) {
      updateData.completedAt = null;
    }
  }
  if (parsed.data.description !== undefined) {
    updateData.description = parsed.data.description;
  }
  if (parsed.data.priority !== undefined) {
    updateData.priority = parsed.data.priority;
  }
  if (parsed.data.dueDate !== undefined) {
    updateData.dueDate = parsed.data.dueDate;
  }
  if (parsed.data.estimatedCost !== undefined) {
    updateData.estimatedCost = parsed.data.estimatedCost;
  }
  if (parsed.data.actualCost !== undefined) {
    updateData.actualCost = parsed.data.actualCost;
  }
  if (parsed.data.assignedToId !== undefined) {
    updateData.assignedToId = parsed.data.assignedToId || null;
  }
  if (parsed.data.recurrenceRule !== undefined) {
    updateData.recurrenceRule = parsed.data.recurrenceRule;
  }
  if (parsed.data.invoiceFileUrl !== undefined) {
    updateData.invoiceFileUrl = parsed.data.invoiceFileUrl;
  }

  const updatedTask = await prisma.maintenanceTask.update({
    where: { id: task.id },
    data: updateData
  });

  return NextResponse.json({ task: updatedTask });
}
