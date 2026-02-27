import type { UserRole } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  role: UserRole;
  email?: string;
  name?: string;
};

export const SESSION_COOKIE_NAME = "rbhm_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function isValidRole(value: string | null): value is UserRole {
  return value === "SUPER_ADMIN" || value === "SHAREHOLDER" || value === "FAMILY_MEMBER" || value === "GUEST";
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "change-this-in-production";
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

type ParsedSession = { userId: string };

function parseSessionToken(token?: string | null): ParsedSession | null {
  if (!token) {
    return null;
  }

  const [userId, expiresAtRaw, signature] = token.split(".");
  if (!userId || !expiresAtRaw || !signature) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${userId}.${expiresAtRaw}`;
  const expectedSignature = signSessionPayload(payload);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  return { userId };
}

async function resolveSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, name: true, isActive: true }
  });

  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name
  };
}

async function getSessionUserFromToken(token?: string | null): Promise<SessionUser | null> {
  const parsed = parseSessionToken(token);
  if (!parsed) {
    return null;
  }

  return resolveSessionUser(parsed.userId);
}

export function createSessionToken(userId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = signSessionPayload(payload);
  return `${payload}.${signature}`;
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const headerId = req.headers.get("x-user-id");
  const headerRole = req.headers.get("x-user-role");
  const headerEmail = req.headers.get("x-user-email") ?? undefined;
  const headerName = req.headers.get("x-user-name") ?? undefined;

  if (headerId && isValidRole(headerRole)) {
    return { id: headerId, role: headerRole, email: headerEmail, name: headerName };
  }

  const cookieUser = await getSessionUserFromToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (cookieUser) {
    return cookieUser;
  }

  if (process.env.DEV_USER_ID && isValidRole(process.env.DEV_USER_ROLE ?? null)) {
    return {
      id: process.env.DEV_USER_ID,
      role: process.env.DEV_USER_ROLE as UserRole,
      email: process.env.SMTP_FROM,
      name: "Dev User"
    };
  }

  return null;
}

export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookieUser = await getSessionUserFromToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (cookieUser) {
    return cookieUser;
  }

  if (process.env.DEV_USER_ID && isValidRole(process.env.DEV_USER_ROLE ?? null)) {
    return {
      id: process.env.DEV_USER_ID,
      role: process.env.DEV_USER_ROLE as UserRole,
      email: process.env.SMTP_FROM,
      name: "Dev User"
    };
  }

  return null;
}
