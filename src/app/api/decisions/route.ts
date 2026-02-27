import { DecisionAudience, DecisionStatus, UserRole } from "@prisma/client";
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

const createDecisionSchema = z.object({
  title: z.string().min(5).max(180),
  description: z.string().min(10).max(5000),
  audience: z.nativeEnum(DecisionAudience).optional(),
  closesAt: z.coerce.date().optional(),
  submitForReview: z.boolean().optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "decision:vote")) {
    return NextResponse.json({ error: "Decision voting permission required" }, { status: 403 });
  }

  const canReview = hasPermission(user.role, "decision:review");
  const where = canReview
    ? undefined
    : {
        OR: [
          { submittedById: user.id },
          {
            status: { in: [DecisionStatus.ACTIVE, DecisionStatus.CLOSED] },
            audience: DecisionAudience.MEMBERS_AND_ADMINS
          }
        ]
      };

  const [decisions, adminEligibleCount, memberEligibleCount] = await Promise.all([
    prisma.decision.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
        votes: { select: { userId: true, choice: true } }
      }
    }),
    prisma.user.count({
      where: { isActive: true, role: { in: eligibleRolesForAudience(DecisionAudience.ADMINS_ONLY) } }
    }),
    prisma.user.count({
      where: { isActive: true, role: { in: eligibleRolesForAudience(DecisionAudience.MEMBERS_AND_ADMINS) } }
    })
  ]);

  const formatted = decisions.map((decision) => {
    const eligibleVoters =
      decision.audience === DecisionAudience.ADMINS_ONLY ? adminEligibleCount : memberEligibleCount;
    const voteSummary = summarizeDecisionVotes(decision.votes);
    const currentUserVote = decision.votes.find((vote) => vote.userId === user.id)?.choice ?? null;
    const canVote =
      canRoleVoteOnAudience(user.role, decision.audience) &&
      isDecisionVoteOpen({ status: decision.status, closesAt: decision.closesAt });

    return {
      id: decision.id,
      title: decision.title,
      description: decision.description,
      audience: decision.audience,
      status: decision.status,
      submittedBy: decision.submittedBy,
      reviewedBy: decision.reviewedBy,
      reviewedAt: decision.reviewedAt,
      launchedAt: decision.launchedAt,
      closesAt: decision.closesAt,
      closedAt: decision.closedAt,
      reviewNotes: decision.reviewNotes,
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
      currentUserVote,
      canVote,
      tracking: {
        eligibleVoters,
        totalVotes: voteSummary.total,
        yes: voteSummary.yes,
        no: voteSummary.no,
        abstain: voteSummary.abstain,
        participationPct:
          eligibleVoters > 0 ? Number(((voteSummary.total / eligibleVoters) * 100).toFixed(1)) : 0
      }
    };
  });

  return NextResponse.json({
    decisions: formatted,
    currentUser: { id: user.id, role: user.role as UserRole },
    capabilities: {
      canReview,
      canCreate: hasPermission(user.role, "decision:create"),
      canSubmit: hasPermission(user.role, "decision:submit")
    }
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const payload = await req.json();
  const parsed = createDecisionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const canCreatePoll = hasPermission(user.role, "decision:create");
  const canSubmitForReview = hasPermission(user.role, "decision:submit");
  if (!canCreatePoll && !canSubmitForReview) {
    return NextResponse.json({ error: "Decision permission required" }, { status: 403 });
  }

  const submitForReview = parsed.data.submitForReview ?? !canCreatePoll;

  if (submitForReview) {
    if (!canSubmitForReview) {
      return NextResponse.json({ error: "Submit-for-review permission required" }, { status: 403 });
    }

    const decision = await prisma.decision.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        status: DecisionStatus.PENDING_REVIEW,
        audience: parsed.data.audience ?? DecisionAudience.MEMBERS_AND_ADMINS,
        submittedById: user.id,
        closesAt: parsed.data.closesAt
      }
    });

    return NextResponse.json({ decision }, { status: 201 });
  }

  if (!canCreatePoll) {
    return NextResponse.json({ error: "Create-poll permission required" }, { status: 403 });
  }

  const decision = await prisma.decision.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      status: DecisionStatus.ACTIVE,
      audience: parsed.data.audience ?? DecisionAudience.MEMBERS_AND_ADMINS,
      submittedById: user.id,
      reviewedById: user.id,
      reviewedAt: new Date(),
      launchedAt: new Date(),
      closesAt: parsed.data.closesAt
    }
  });

  return NextResponse.json({ decision }, { status: 201 });
}
