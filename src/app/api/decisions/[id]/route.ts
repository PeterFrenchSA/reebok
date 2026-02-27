import { DecisionAudience, DecisionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

const updateDecisionSchema = z.object({
  action: z.enum(["launch", "close", "reject"]),
  audience: z.nativeEnum(DecisionAudience).optional(),
  closesAt: z.coerce.date().optional(),
  reviewNotes: z.string().max(2000).optional()
});

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "decision:review")) {
    return NextResponse.json({ error: "Decision review permission required" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await req.json();
  const parsed = updateDecisionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.decision.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  if (parsed.data.action === "launch") {
    if (![DecisionStatus.PENDING_REVIEW, DecisionStatus.REJECTED].includes(existing.status)) {
      return NextResponse.json(
        { error: "Only pending/rejected decisions can be launched." },
        { status: 400 }
      );
    }

    const updated = await prisma.decision.update({
      where: { id },
      data: {
        status: DecisionStatus.ACTIVE,
        audience: parsed.data.audience ?? existing.audience,
        reviewedById: user.id,
        reviewedAt: new Date(),
        launchedAt: new Date(),
        closesAt: parsed.data.closesAt ?? existing.closesAt,
        closedAt: null,
        reviewNotes: parsed.data.reviewNotes ?? null
      }
    });

    return NextResponse.json({ decision: updated });
  }

  if (parsed.data.action === "close") {
    if (existing.status !== DecisionStatus.ACTIVE) {
      return NextResponse.json({ error: "Only active decisions can be closed." }, { status: 400 });
    }

    const updated = await prisma.decision.update({
      where: { id },
      data: {
        status: DecisionStatus.CLOSED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        closedAt: new Date(),
        reviewNotes: parsed.data.reviewNotes ?? existing.reviewNotes
      }
    });

    return NextResponse.json({ decision: updated });
  }

  if (existing.status !== DecisionStatus.PENDING_REVIEW) {
    return NextResponse.json({ error: "Only pending decisions can be rejected." }, { status: 400 });
  }

  const updated = await prisma.decision.update({
    where: { id },
    data: {
      status: DecisionStatus.REJECTED,
      reviewedById: user.id,
      reviewedAt: new Date(),
      closedAt: new Date(),
      reviewNotes: parsed.data.reviewNotes ?? "Rejected by admin review."
    }
  });

  return NextResponse.json({ decision: updated });
}
