import type { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

export type SessionUser = {
  id: string;
  role: UserRole;
  email?: string;
};

function isValidRole(value: string | null): value is UserRole {
  return value === "SUPER_ADMIN" || value === "SHAREHOLDER" || value === "FAMILY_MEMBER" || value === "GUEST";
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const headerId = req.headers.get("x-user-id");
  const headerRole = req.headers.get("x-user-role");
  const headerEmail = req.headers.get("x-user-email") ?? undefined;

  if (headerId && isValidRole(headerRole)) {
    return { id: headerId, role: headerRole, email: headerEmail };
  }

  if (process.env.DEV_USER_ID && isValidRole(process.env.DEV_USER_ROLE ?? null)) {
    return {
      id: process.env.DEV_USER_ID,
      role: process.env.DEV_USER_ROLE as UserRole,
      email: process.env.SMTP_FROM
    };
  }

  return null;
}
