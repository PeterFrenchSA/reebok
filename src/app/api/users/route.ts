import { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  role: z.nativeEnum(UserRole),
  password: z.string().min(4).max(120),
  isActive: z.boolean().optional().default(true)
});

const updateUserSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().min(2).max(120).optional(),
    role: z.nativeEnum(UserRole).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(4).max(120).optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.role === undefined &&
      value.isActive === undefined &&
      value.password === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field must be provided."
      });
    }
  });

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ users });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};

  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name;
  }

  if (parsed.data.role !== undefined) {
    data.role = parsed.data.role;
  }

  if (parsed.data.isActive !== undefined) {
    if (parsed.data.userId === user.id && parsed.data.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    data.isActive = parsed.data.isActive;
  }

  if (parsed.data.password !== undefined) {
    data.passwordHash = hashPassword(parsed.data.password);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true }
  });

  if (!exists) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: parsed.data.userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ user: updated });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "User already exists." }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const userRecord = await tx.user.create({
      data: {
        email,
        name: parsed.data.name,
        role: parsed.data.role,
        isActive: parsed.data.isActive,
        invitedById: user.id,
        passwordHash: hashPassword(parsed.data.password)
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (parsed.data.role === "SHAREHOLDER") {
      await tx.shareholderProfile.create({
        data: {
          userId: userRecord.id,
          votingEnabled: true
        }
      });
    }

    return userRecord;
  });

  return NextResponse.json({ user: created }, { status: 201 });
}
