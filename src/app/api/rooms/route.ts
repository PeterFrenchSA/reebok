import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const roomSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  capacity: z.number().int().positive().max(50),
  isBookable: z.boolean().default(true),
  notes: z.string().max(1000).optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const canManage = hasPermission(user.role, "booking:manage");
  const rooms = await prisma.room.findMany({
    where: canManage ? undefined : { isBookable: true },
    orderBy: { name: "asc" }
  });

  return NextResponse.json({ rooms });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Room management permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = roomSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const room = parsed.data.id
    ? await prisma.room.update({
        where: { id: parsed.data.id },
        data: {
          name: parsed.data.name,
          code: parsed.data.code,
          capacity: parsed.data.capacity,
          isBookable: parsed.data.isBookable,
          notes: parsed.data.notes
        }
      })
    : await prisma.room.create({
        data: {
          name: parsed.data.name,
          code: parsed.data.code,
          capacity: parsed.data.capacity,
          isBookable: parsed.data.isBookable,
          notes: parsed.data.notes
        }
      });

  return NextResponse.json({ room }, { status: 201 });
}
