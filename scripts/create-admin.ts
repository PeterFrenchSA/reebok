import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const parsed = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(16).max(128)
  }).safeParse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrator",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD
  });
  if (!parsed.success) {
    throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (16-128 characters). No default password is used.");
  }
  const passwordHash = hashPassword(parsed.data.password);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(741929, 1)`;
    const existing = await tx.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true, passwordHash: { not: null } },
      select: { id: true }
    });
    if (existing) throw new Error("An active super-admin already exists. Use User Administration; bootstrap will not change existing accounts.");
    if (await tx.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) {
      throw new Error("That email already belongs to an account. Bootstrap will not overwrite it.");
    }
    await tx.user.create({ data: { email: parsed.data.email, name: parsed.data.name, role: "SUPER_ADMIN", passwordHash } });
  });
  console.log("Initial super-admin created. Sign in and use User Administration to appoint other administrators.");
}

main().catch((error: unknown) => {
  // Prisma errors may include query data; only print our own validation messages.
  console.error(error instanceof Error && error.constructor === Error ? error.message : "Admin creation failed. Check database access and schema.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
