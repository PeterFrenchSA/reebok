import { ExpenseCategory, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { extractInvoiceWithOpenAI } from "@/lib/ocr";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const schema = z.object({
  imageUrl: z.string().url(),
  saveExpense: z.boolean().default(false),
  category: z.nativeEnum(ExpenseCategory).optional(),
  title: z.string().max(160).optional()
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);

  if (!user || !hasPermission(user.role, "finance:edit")) {
    return NextResponse.json({ error: "Finance edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const extraction = await extractInvoiceWithOpenAI(parsed.data.imageUrl);

  if (!parsed.data.saveExpense) {
    return NextResponse.json({ extraction });
  }

  const amount = extraction.amountTotal ?? 0;
  const expense = await prisma.expense.create({
    data: {
      category: parsed.data.category ?? ExpenseCategory.OTHER,
      title: parsed.data.title ?? extraction.supplierName ?? "Invoice expense",
      supplier: extraction.supplierName,
      invoiceNumber: extraction.invoiceNumber,
      amount,
      currency: extraction.currency ?? "ZAR",
      serviceDate: extraction.invoiceDate ? new Date(extraction.invoiceDate) : undefined,
      dueDate: extraction.dueDate ? new Date(extraction.dueDate) : undefined,
      invoiceFileUrl: parsed.data.imageUrl,
      ocrData: extraction as Prisma.InputJsonValue,
      createdById: user.id
    }
  });

  return NextResponse.json({ extraction, expense }, { status: 201 });
}
