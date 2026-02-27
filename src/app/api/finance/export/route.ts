import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { toXlsxBuffer } from "@/lib/xlsx";

function normalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
      return JSON.stringify(value);
    }

    if (!("toString" in (value as object))) {
      return value;
    }

    const stringValue = String(value);
    if (/^\d+(\.\d+)?$/.test(stringValue)) {
      return Number(stringValue);
    }
  }

  return value;
}

function sanitizeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = normalize(value);
    }
    return out;
  });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:import-export")) {
    return NextResponse.json({ error: "Finance import/export permission required" }, { status: 403 });
  }

  const entity = req.nextUrl.searchParams.get("entity") ?? "expenses";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  let rows: Array<Record<string, unknown>> = [];

  if (entity === "expenses") {
    rows = sanitizeRows(await prisma.expense.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }));
  } else if (entity === "bookings") {
    rows = sanitizeRows(await prisma.booking.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }));
  } else if (entity === "payments") {
    rows = sanitizeRows(await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }));
  } else if (entity === "subscriptions") {
    rows = sanitizeRows(await prisma.subscription.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }));
  } else {
    return NextResponse.json(
      { error: "Invalid entity. Use expenses, bookings, payments, or subscriptions." },
      { status: 400 }
    );
  }

  const fileBase = `${entity}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "xlsx") {
    const buffer = toXlsxBuffer(rows, entity);
    const body = Uint8Array.from(buffer).buffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=${fileBase}.xlsx`
      }
    });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${fileBase}.csv`
    }
  });
}
