import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FeedbackError, feedbackAuthor, feedbackInclude, feedbackJson, feedbackPageSchema, feedbackReplySchema, feedbackStatusSchema, withAppFeedback } from "@/lib/app-feedback";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Context) {
  return withAppFeedback(req, async () => {
    const { id } = await params;
    const page = feedbackPageSchema.safeParse(req.nextUrl.searchParams.get("page") ?? 1);
    if (!page.success) throw new FeedbackError("Invalid page number.");
    const item = await prisma.appFeedbackThread.findUnique({ where: { id }, include: feedbackInclude });
    if (!item) throw new FeedbackError("Feedback not found.", 404);
    const entries = await prisma.appFeedbackEntry.findMany({ where: { threadId: id }, include: { author: feedbackAuthor },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page.data - 1) * 30, take: 30 });
    return NextResponse.json({ item, entries, page: page.data, hasMore: page.data * 30 < item._count.entries });
  });
}

export async function POST(req: NextRequest, { params }: Context) {
  return withAppFeedback(req, async (userId) => {
    const { id } = await params;
    const parsed = feedbackReplySchema.safeParse(await feedbackJson(req));
    if (!parsed.success) throw new FeedbackError("Enter a reply of 1-2000 characters.");
    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.appFeedbackThread.updateMany({ where: { id }, data: { updatedAt: new Date(), version: { increment: 1 } } });
      if (!updated.count) throw new FeedbackError("Feedback not found.", 404);
      return tx.appFeedbackEntry.create({ data: { threadId: id, authorId: userId, body: parsed.data.body }, include: { author: feedbackAuthor } });
    });
    return NextResponse.json({ entry }, { status: 201 });
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  return withAppFeedback(req, async (userId) => {
    const { id } = await params;
    const parsed = feedbackStatusSchema.safeParse(await feedbackJson(req));
    if (!parsed.success) throw new FeedbackError("Select a valid status and refresh the discussion before retrying.");
    const item = await prisma.$transaction(async (tx) => {
      const current = await tx.appFeedbackThread.findUnique({ where: { id } });
      if (!current) throw new FeedbackError("Feedback not found.", 404);
      if (current.version !== parsed.data.version) throw new FeedbackError("This discussion has changed. Refresh it before changing the status.", 409);
      if (current.status !== parsed.data.status) {
        const updated = await tx.appFeedbackThread.updateMany({ where: { id, version: parsed.data.version }, data: { status: parsed.data.status, version: { increment: 1 } } });
        if (!updated.count) throw new FeedbackError("This discussion has changed. Refresh it before changing the status.", 409);
        await tx.appFeedbackEntry.create({ data: { threadId: id, authorId: userId, fromStatus: current.status, toStatus: parsed.data.status } });
      }
      return tx.appFeedbackThread.findUniqueOrThrow({ where: { id }, include: feedbackInclude });
    });
    return NextResponse.json({ item });
  });
}
