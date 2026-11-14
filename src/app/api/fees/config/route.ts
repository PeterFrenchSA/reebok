import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { feeConfigSchema } from "@/lib/pricing-config";
import { BookingRuleError, withBookingLock } from "@/lib/availability";
import { rejectForeignWrite } from "@/lib/write-origin";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:view")) return NextResponse.json({ error: "Finance view permission required." }, { status: 403 });
  const asAt = req.nextUrl.searchParams.get("asAt");
  const date = asAt ? new Date(asAt) : new Date();
  if (!Number.isFinite(date.getTime())) return NextResponse.json({ error: "Invalid pricing date." }, { status: 400 });
  const include = { seasonalRates: { orderBy: [{ priority: "desc" as const }, { name: "asc" as const }] } };
  const feeConfig = await prisma.feeConfig.findFirst({ where: { isActive: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }], include });
  const history = req.nextUrl.searchParams.get("history") === "true"
    ? await prisma.feeConfig.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], include, take: 50 }) : undefined;
  return NextResponse.json({ feeConfig, history }, { headers });
}

export async function POST(req: NextRequest) {
  const rejected = rejectForeignWrite(req);
  if (rejected) return rejected;
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) return NextResponse.json({ error: "Finance edit permission required." }, { status: 403 });
  const parsed = feeConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ") }, { status: 400 });
  try {
    const feeConfig = await withBookingLock(async (tx) => {
      const { basedOnId, seasonalRates, ...data } = parsed.data;
      const latest = await tx.feeConfig.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (basedOnId !== undefined && basedOnId !== (latest?.id ?? null)) throw new BookingRuleError("Pricing was changed by another administrator. Reload before publishing your version.", 409);
      return tx.feeConfig.create({ data: { ...data, effectiveFrom: data.effectiveFrom ?? new Date(), seasonalRates: { create: seasonalRates } }, include: { seasonalRates: true } });
    });
    return NextResponse.json({ feeConfig }, { status: 201, headers });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not publish pricing." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rejected = rejectForeignWrite(req);
  if (rejected) return rejected;
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) return NextResponse.json({ error: "Finance edit permission required." }, { status: 403 });
  const parsed = z.object({ id: z.string(), isActive: z.boolean().optional(), effectiveTo: z.coerce.date().nullable().optional(),
    overdueReminderEnabled: z.boolean().optional(), externalWholeHouseMinRate: z.number().finite().nonnegative().max(1000000).multipleOf(0.01).nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pricing update." }, { status: 400 });
  try {
    const feeConfig = await withBookingLock(async (tx) => {
      const { id, ...data } = parsed.data;
      const current = await tx.feeConfig.findUnique({ where: { id } });
      if (!current) throw new BookingRuleError("Pricing version not found.", 404);
      if (data.effectiveTo && data.effectiveTo < current.effectiveFrom) throw new BookingRuleError("End date must not precede the effective date.");
      return tx.feeConfig.update({ where: { id }, data, include: { seasonalRates: true } });
    });
    return NextResponse.json({ feeConfig }, { headers });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not update pricing." }, { status: 500 });
  }
}
