import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["SHAREHOLDER", "FAMILY_MEMBER", "GUEST"]).default("FAMILY_MEMBER"),
  expiresInDays: z.number().int().positive().max(90).default(14)
});

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const invitationListSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  registrationName: true,
  registrationRequestedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true, email: true, role: true } },
  reviewedBy: { select: { id: true, name: true, email: true, role: true } }
} as const;

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const invitations = await prisma.invitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: invitationListSelect
  });

  return NextResponse.json({ invitations });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = createInvitationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inviteEmail = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: inviteEmail } });
  if (existingUser) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const token = makeToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      email: inviteEmail,
      role: parsed.data.role,
      token,
      invitedById: user.id,
      expiresAt
    },
    select: invitationListSelect
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

  await sendMail({
    to: invitation.email,
    subject: "Invitation to Reebok House Manager",
    text: [
      "You have been invited to join Reebok House Manager.",
      `Role: ${invitation.role}`,
      "Use the link below to register your account details.",
      "Your registration will be reviewed by an administrator before your account is activated.",
      `Register: ${inviteUrl}`,
      `Expires: ${invitation.expiresAt.toISOString().slice(0, 10)}`
    ].join("\n")
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
