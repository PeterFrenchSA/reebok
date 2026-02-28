import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().min(3).max(500).optional()
});

type RouteContext = { params: Promise<{ id: string }> };

const invitationResponseSelect = {
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

const managedUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      invitedById: true,
      status: true,
      registrationName: true,
      registrationPasswordHash: true,
      registrationRequestedAt: true,
      expiresAt: true
    }
  });
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation has expired." }, { status: 410 });
  }

  if (invitation.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "Only pending approval registrations can be reviewed." }, { status: 400 });
  }

  if (parsed.data.action === "reject") {
    if (!parsed.data.reason) {
      return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
    }

    const updated = await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: user.id,
        rejectionReason: parsed.data.reason
      },
      select: invitationResponseSelect
    });

    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    await sendMail({
      to: updated.email,
      subject: "Invitation registration update",
      text: [
        "Your invitation registration was reviewed and requires changes before approval.",
        `Reason: ${parsed.data.reason}`,
        `You can resubmit registration using the same link: ${baseUrl}/accept-invite?token=${invitation.token}`
      ].join("\n")
    });

    return NextResponse.json({ invitation: updated, message: "Invitation registration rejected." });
  }

  if (!invitation.registrationName || !invitation.registrationPasswordHash || !invitation.registrationRequestedAt) {
    return NextResponse.json({ error: "Registration details are incomplete for this invitation." }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email.toLowerCase() } });
  if (existingUser) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const [createdUser, updatedInvitation] = await prisma.$transaction(async (tx) => {
    const userRecord = await tx.user.create({
      data: {
        email: invitation.email.toLowerCase(),
        name: invitation.registrationName ?? invitation.email,
        role: invitation.role,
        invitedById: invitation.invitedById,
        passwordHash: invitation.registrationPasswordHash,
        isActive: true
      },
      select: managedUserSelect
    });

    if (invitation.role === "SHAREHOLDER") {
      await tx.shareholderProfile.create({
        data: {
          userId: userRecord.id,
          votingEnabled: true
        }
      });
    }

    const updatedRecord = await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: user.id,
        acceptedAt: new Date(),
        rejectionReason: null
      },
      select: invitationResponseSelect
    });

    return [userRecord, updatedRecord];
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  await sendMail({
    to: createdUser.email,
    subject: "Your account has been approved",
    text: [
      "Your registration has been approved.",
      `You can now sign in at: ${baseUrl}/login`
    ].join("\n")
  });

  return NextResponse.json({ invitation: updatedInvitation, user: createdUser });
}
