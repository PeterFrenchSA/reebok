import { FeedbackVisibility } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const createFeedbackSchema = z.object({
  bookingId: z.string().optional(),
  name: z.string().max(120).optional(),
  email: z.string().email().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().min(3).max(2000),
  visibility: z.nativeEnum(FeedbackVisibility).default(FeedbackVisibility.PUBLIC),
  isPublished: z.boolean().optional()
});

const updateFeedbackSchema = z.object({
  id: z.string().min(1),
  visibility: z.nativeEnum(FeedbackVisibility).optional(),
  isPublished: z.boolean().optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  const visibilityFilter = req.nextUrl.searchParams.get("visibility") as FeedbackVisibility | null;

  const canViewInternal = Boolean(user && hasPermission(user.role, "feedback:internal"));

  const feedback = await prisma.feedback.findMany({
    where: {
      visibility:
        visibilityFilter && Object.values(FeedbackVisibility).includes(visibilityFilter)
          ? visibilityFilter
          : canViewInternal
            ? undefined
            : FeedbackVisibility.PUBLIC,
      isPublished: canViewInternal ? undefined : true
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      booking: { select: { id: true, startDate: true, endDate: true, status: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });

  return NextResponse.json({ feedback });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  const payload = await req.json();
  const parsed = createFeedbackSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (
    parsed.data.visibility === FeedbackVisibility.INTERNAL &&
    (!user || !hasPermission(user.role, "feedback:internal"))
  ) {
    return NextResponse.json(
      { error: "Only shareholders/super-admin can post internal feedback" },
      { status: 403 }
    );
  }

  const entry = await prisma.feedback.create({
    data: {
      bookingId: parsed.data.bookingId,
      userId: user?.id,
      name: parsed.data.name,
      email: parsed.data.email,
      rating: parsed.data.rating,
      message: parsed.data.message,
      visibility: parsed.data.visibility,
      isPublished:
        parsed.data.visibility === FeedbackVisibility.PUBLIC
          ? parsed.data.isPublished ?? true
          : false
    }
  });

  return NextResponse.json({ feedback: entry }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "feedback:internal")) {
    return NextResponse.json({ error: "Feedback moderation permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = updateFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.visibility === undefined && parsed.data.isPublished === undefined) {
    return NextResponse.json({ error: "No moderation fields provided." }, { status: 400 });
  }

  const feedback = await prisma.feedback.update({
    where: { id: parsed.data.id },
    data: {
      visibility: parsed.data.visibility,
      isPublished: parsed.data.isPublished
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      booking: { select: { id: true, startDate: true, endDate: true, status: true } }
    }
  });

  return NextResponse.json({ feedback });
}
