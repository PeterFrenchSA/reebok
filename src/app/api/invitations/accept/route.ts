import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getApproverEmails, sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { opaqueTokenCandidates } from "@/lib/tokens";

const schema = z.object({
  token: z.string().min(10),
  name: z.string().min(2).max(120),
  password: z.string().min(4).max(120)
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    namespace: "invitations:accept",
    key: rateLimitKey(req, parsed.data.token.slice(0, 12)),
    limit: 20,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const tokenCandidates = opaqueTokenCandidates(parsed.data.token);
  if (tokenCandidates.length === 0) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const invitation = await prisma.invitation.findFirst({
    where: {
      OR: tokenCandidates.map((token) => ({ token }))
    }
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  if (invitation.status === "APPROVED" || invitation.acceptedAt) {
    return NextResponse.json({ error: "Invitation already approved" }, { status: 409 });
  }

  if (invitation.status === "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: "Registration already submitted and awaiting admin approval." },
      { status: 409 }
    );
  }

  const inviteEmail = invitation.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: inviteEmail } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const updatedInvitation = await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: "PENDING_APPROVAL",
      registrationName: parsed.data.name.trim(),
      registrationPasswordHash: hashPassword(parsed.data.password),
      registrationRequestedAt: new Date(),
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null
    }
  });

  const approverEmails = getApproverEmails();
  if (approverEmails.length > 0) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    await sendMail({
      to: approverEmails,
      subject: "Invitation registration submitted",
      text: [
        "A new invited user has completed registration and is awaiting approval.",
        `Email: ${inviteEmail}`,
        `Name: ${updatedInvitation.registrationName ?? "Not provided"}`,
        `Role requested: ${updatedInvitation.role}`,
        `Invitation ID: ${updatedInvitation.id}`,
        `Review in admin: ${baseUrl}/admin/users`
      ].join("\n")
    });
  }

  return NextResponse.json(
    { message: "Registration submitted successfully. Awaiting admin approval." },
    { status: 201 }
  );
}
