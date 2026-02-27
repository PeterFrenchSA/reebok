import {
  DecisionAudience,
  DecisionStatus,
  DecisionVoteChoice,
  UserRole
} from "@prisma/client";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SHAREHOLDER"];
const MEMBERS_AND_ADMINS_ROLES: UserRole[] = ["SUPER_ADMIN", "SHAREHOLDER", "FAMILY_MEMBER"];

export function eligibleRolesForAudience(audience: DecisionAudience): UserRole[] {
  return audience === DecisionAudience.ADMINS_ONLY ? ADMIN_ROLES : MEMBERS_AND_ADMINS_ROLES;
}

export function canRoleVoteOnAudience(role: UserRole, audience: DecisionAudience): boolean {
  return eligibleRolesForAudience(audience).includes(role);
}

export function isDecisionVoteOpen(params: {
  status: DecisionStatus;
  closesAt?: Date | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (params.status !== DecisionStatus.ACTIVE) {
    return false;
  }

  if (params.closesAt && params.closesAt < now) {
    return false;
  }

  return true;
}

export function summarizeDecisionVotes(votes: Array<{ choice: DecisionVoteChoice }>): {
  yes: number;
  no: number;
  abstain: number;
  total: number;
} {
  let yes = 0;
  let no = 0;
  let abstain = 0;

  for (const vote of votes) {
    if (vote.choice === DecisionVoteChoice.YES) {
      yes += 1;
    } else if (vote.choice === DecisionVoteChoice.NO) {
      no += 1;
    } else {
      abstain += 1;
    }
  }

  return { yes, no, abstain, total: votes.length };
}
