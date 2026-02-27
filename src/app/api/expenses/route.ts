import { ExpenseCategory, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const documentUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Document URL must be absolute or root-relative.");

const expenseSchema = z.object({
  id: z.string().optional(),
  category: z.nativeEnum(ExpenseCategory).default(ExpenseCategory.OTHER),
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  supplier: z.string().max(160).optional(),
  invoiceNumber: z.string().max(120).optional(),
  amount: z.number().nonnegative(),
  currency: z.string().default("ZAR"),
  serviceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  paidDate: z.coerce.date().optional(),
  invoiceFileUrl: documentUrlSchema.optional(),
  ocrData: z.unknown().optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:view")) {
    return NextResponse.json({ error: "Finance view permission required" }, { status: 403 });
  }

  const category = req.nextUrl.searchParams.get("category") as ExpenseCategory | null;
  const take = Number(req.nextUrl.searchParams.get("take") ?? 200);

  const expenses = await prisma.expense.findMany({
    where: {
      category: category && Object.values(ExpenseCategory).includes(category) ? category : undefined
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } }
    },
    orderBy: { serviceDate: "desc" },
    take: take > 0 && take <= 1000 ? take : 200
  });

  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "finance:edit")) {
    return NextResponse.json({ error: "Finance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = expenseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const expense = parsed.data.id
    ? await prisma.expense.update({
        where: { id: parsed.data.id },
        data: {
          category: parsed.data.category,
          title: parsed.data.title,
          description: parsed.data.description,
          supplier: parsed.data.supplier,
          invoiceNumber: parsed.data.invoiceNumber,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          serviceDate: parsed.data.serviceDate,
          dueDate: parsed.data.dueDate,
          paidDate: parsed.data.paidDate,
          invoiceFileUrl: parsed.data.invoiceFileUrl,
          ocrData: parsed.data.ocrData as Prisma.InputJsonValue | undefined
        }
      })
    : await prisma.expense.create({
        data: {
          category: parsed.data.category,
          title: parsed.data.title,
          description: parsed.data.description,
          supplier: parsed.data.supplier,
          invoiceNumber: parsed.data.invoiceNumber,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          serviceDate: parsed.data.serviceDate,
          dueDate: parsed.data.dueDate,
          paidDate: parsed.data.paidDate,
          invoiceFileUrl: parsed.data.invoiceFileUrl,
          ocrData: parsed.data.ocrData as Prisma.InputJsonValue | undefined,
          createdById: user.id
        }
      });

  return NextResponse.json({ expense }, { status: 201 });
}
