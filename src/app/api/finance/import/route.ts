import { assertReservation, BookingRuleError, withBookingLock } from "@/lib/availability";
import { BookingScope, BookingSource, BookingStatus, ExpenseCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { fromCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { fromXlsxBuffer } from "@/lib/xlsx";

const importSchema = z.object({
  entity: z.enum(["expenses", "bookings", "payments", "subscriptions"]),
  format: z.enum(["csv", "xlsx"]),
  data: z.string().min(1)
});

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

async function parseRows(payload: z.infer<typeof importSchema>): Promise<Array<Record<string, unknown>>> {
  if (payload.format === "csv") {
    return fromCsv(payload.data);
  }

  const buffer = Buffer.from(payload.data, "base64");
  return fromXlsxBuffer(buffer);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:import-export")) {
    return NextResponse.json({ error: "Finance import/export permission required" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = await parseRows(parsed.data);
  if (rows.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  let imported = 0;

  if (parsed.data.entity === "expenses") {
    for (const row of rows) {
      const category = String(row.category ?? "OTHER");
      const safeCategory = Object.values(ExpenseCategory).includes(category as ExpenseCategory)
        ? (category as ExpenseCategory)
        : ExpenseCategory.OTHER;

      await prisma.expense.create({
        data: {
          category: safeCategory,
          title: String(row.title ?? row.description ?? "Imported expense"),
          description: row.description ? String(row.description) : undefined,
          supplier: row.supplier ? String(row.supplier) : undefined,
          invoiceNumber: row.invoiceNumber ? String(row.invoiceNumber) : undefined,
          amount: parseNumber(row.amount, 0),
          currency: String(row.currency ?? "ZAR"),
          serviceDate: parseDate(row.serviceDate) ?? undefined,
          dueDate: parseDate(row.dueDate) ?? undefined,
          paidDate: parseDate(row.paidDate) ?? undefined,
          createdById: user.id
        }
      });
      imported += 1;
    }
  }

  if (parsed.data.entity === "bookings") {
    try {
    await withBookingLock(async (tx) => {
    for (const row of rows) {
      const source = String(row.source ?? "MANUAL_IMPORT");
      const status = String(row.status ?? "PENDING");
      const scope = String(row.scope ?? "WHOLE_HOUSE");

      const safeSource = Object.values(BookingSource).includes(source as BookingSource)
        ? (source as BookingSource)
        : BookingSource.MANUAL_IMPORT;
      const safeStatus = Object.values(BookingStatus).includes(status as BookingStatus)
        ? (status as BookingStatus)
        : BookingStatus.PENDING;
      const safeScope = Object.values(BookingScope).includes(scope as BookingScope)
        ? (scope as BookingScope)
        : BookingScope.WHOLE_HOUSE;

      const startDate = parseDate(row.startDate);
      const endDate = parseDate(row.endDate);

      if (!startDate || !endDate) {
        continue;
      }

      if (safeScope === BookingScope.ROOM_SPECIFIC) throw new BookingRuleError("Room bookings must be allocated through the booking workflow, not CSV import.");
      if (endDate <= startDate) throw new BookingRuleError("Imported check-out must be after check-in.");
      if ([BookingStatus.PENDING, BookingStatus.APPROVED].some((status) => status === safeStatus)) await assertReservation(tx, { startDate, endDate, scope: safeScope, totalGuests: Math.max(1, Math.round(parseNumber(row.totalGuests, 1))), allowHistorical: true });
      await tx.booking.create({
        data: {
          source: safeSource,
          status: safeStatus,
          scope: safeScope,
          startDate,
          endDate,
          nights: Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
          bookingAuditLogs: { create: { actorId: user.id, actorRole: user.role, action: "CREATED", comment: "Booking imported by a finance administrator." } },
          totalGuests: Math.max(1, Math.round(parseNumber(row.totalGuests, 1))),
          notes: row.notes ? String(row.notes) : undefined,
          totalAmount: parseNumber(row.totalAmount, 0),
          currency: String(row.currency ?? "ZAR")
        }
      });
      imported += 1;
    }
    });
    } catch (error) {
      if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }

  if (parsed.data.entity === "payments") {
    for (const row of rows) {
      const amount = parseNumber(row.amount, 0);
      if (amount <= 0) {
        continue;
      }

      const method = String(row.method ?? "MANUAL_PROOF");
      const status = String(row.status ?? "PENDING");

      const safeMethod = Object.values(PaymentMethod).includes(method as PaymentMethod)
        ? (method as PaymentMethod)
        : PaymentMethod.MANUAL_PROOF;
      const safeStatus = Object.values(PaymentStatus).includes(status as PaymentStatus)
        ? (status as PaymentStatus)
        : PaymentStatus.PENDING;

      await prisma.payment.create({
        data: {
          amount,
          currency: String(row.currency ?? "ZAR"),
          method: safeMethod,
          status: safeStatus,
          reference: row.reference ? String(row.reference) : undefined,
          proofFileUrl: row.proofFileUrl ? String(row.proofFileUrl) : undefined,
          paidAt: parseDate(row.paidAt) ?? undefined,
          gatewayProvider: row.gatewayProvider ? String(row.gatewayProvider) : undefined
        }
      });
      imported += 1;
    }
  }

  if (parsed.data.entity === "subscriptions") {
    for (const row of rows) {
      if (!row.userId) {
        continue;
      }

      const userId = String(row.userId);
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!existingUser) {
        continue;
      }

      await prisma.subscription.upsert({
        where: { userId },
        update: {
          monthlyAmount: Math.max(0, parseNumber(row.monthlyAmount, 100)),
          arrearsAmount: Math.max(0, parseNumber(row.arrearsAmount, 0)),
          reminderEnabled: String(row.reminderEnabled ?? "true") !== "false",
          lastPaymentDate: parseDate(row.lastPaymentDate) ?? undefined,
          nextDueDate: parseDate(row.nextDueDate) ?? undefined
        },
        create: {
          userId,
          monthlyAmount: Math.max(0, parseNumber(row.monthlyAmount, 100)),
          arrearsAmount: Math.max(0, parseNumber(row.arrearsAmount, 0)),
          reminderEnabled: String(row.reminderEnabled ?? "true") !== "false",
          lastPaymentDate: parseDate(row.lastPaymentDate) ?? undefined,
          nextDueDate: parseDate(row.nextDueDate) ?? undefined
        }
      });
      imported += 1;
    }
  }

  return NextResponse.json({ imported, skipped: rows.length - imported, entity: parsed.data.entity });
}
