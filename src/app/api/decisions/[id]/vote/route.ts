import { DecisionVoteChoice } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  canRoleVoteOnAudience,
  eligibleRolesForAudience,
  isDecisionVoteOpen,
  summarizeDecisionVotes
} from "@/lib/decisions";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

const voteSchema = z.object({
  choice: z.nativeEnum(DecisionVoteChoice)
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "decision:vote")) {
    return NextResponse.json({ error: "Decision vote permission required" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await req.json();
  const parsed = voteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const decision = await prisma.decision.findUnique({
    where: { id },
    select: { id: true, status: true, audience: true, closesAt: true }
  });

  if (!decision) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  if (!isDecisionVoteOpen({ status: decision.status, closesAt: decision.closesAt })) {
    return NextResponse.json({ error: "Voting is closed for this decision." }, { status: 400 });
  }

  if (!canRoleVoteOnAudience(user.role, decision.audience)) {
    return NextResponse.json({ error: "This poll is not open to your role." }, { status: 403 });
  }

  await prisma.decisionVote.upsert({
    where: { decisionId_userId: { decisionId: decision.id, userId: user.id } },
    update: { choice: parsed.data.choice },
    create: { decisionId: decision.id, userId: user.id, choice: parsed.data.choice }
  });

  const [votes, eligibleVoters] = await Promise.all([
    prisma.decisionVote.findMany({ where: { decisionId: decision.id }, select: { choice: true } }),
    prisma.user.count({
      where: { isActive: true, role: { in: eligibleRolesForAudience(decision.audience) } }
    })
  ]);

  const summary = summarizeDecisionVotes(votes);

  return NextResponse.json({
    decisionId: decision.id,
    currentUserVote: parsed.data.choice,
    tracking: {
      eligibleVoters,
      totalVotes: summary.total,
      yes: summary.yes,
      no: summary.no,
      abstain: summary.abstain,
      participationPct: eligibleVoters > 0 ? Number(((summary.total / eligibleVoters) * 100).toFixed(1)) : 0
    }
  });
}
