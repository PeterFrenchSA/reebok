import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().min(10),
  name: z.string().min(2).max(120)
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: parsed.data.token }
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.acceptedAt) {
    return NextResponse.json({ error: "Invitation already accepted" }, { status: 409 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  const inviteEmail = invitation.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: inviteEmail } });
  if (existingUser) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() }
    });

    return NextResponse.json({
      user: existingUser,
      message: "User already exists. Invitation marked as accepted."
    });
  }

  const user = await prisma.user.create({
    data: {
      email: inviteEmail,
      name: parsed.data.name,
      role: invitation.role,
      invitedById: invitation.invitedById
    }
  });

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() }
  });

  if (invitation.role === "SHAREHOLDER") {
    await prisma.shareholderProfile.create({
      data: {
        userId: user.id,
        votingEnabled: true
      }
    });
  }

  return NextResponse.json({ user }, { status: 201 });
}
