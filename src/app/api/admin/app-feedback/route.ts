import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { feedbackCategories, feedbackStatuses } from "@/lib/app-feedback-shared";
import { FeedbackError, feedbackInclude, feedbackJson, feedbackPageSchema, newFeedbackSchema, withAppFeedback } from "@/lib/app-feedback";

export const dynamic = "force-dynamic";
const querySchema = z.object({ page: feedbackPageSchema, status: z.enum(feedbackStatuses).optional(), category: z.enum(feedbackCategories).optional() });

export async function GET(req: NextRequest) {
  return withAppFeedback(req, async () => {
    const parsed = querySchema.safeParse({ page: req.nextUrl.searchParams.get("page") ?? 1,
      status: req.nextUrl.searchParams.get("status") ?? undefined, category: req.nextUrl.searchParams.get("category") ?? undefined });
    if (!parsed.success) throw new FeedbackError("Invalid filters or page number.");
    const { page, ...where } = parsed.data;
    const [items, total] = await prisma.$transaction([
      prisma.appFeedbackThread.findMany({ where, include: feedbackInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      prisma.appFeedbackThread.count({ where })
    ]);
    return NextResponse.json({ items, total, page, hasMore: page * 20 < total });
  });
}

export async function POST(req: NextRequest) {
  return withAppFeedback(req, async (userId) => {
    const parsed = newFeedbackSchema.safeParse(await feedbackJson(req));
    if (!parsed.success) throw new FeedbackError("Enter a title (5-160 characters), details (10-4000 characters) and a valid category.");
    const item = await prisma.appFeedbackThread.create({ data: { ...parsed.data, authorId: userId }, include: feedbackInclude });
    return NextResponse.json({ item }, { status: 201 });
  });
}
