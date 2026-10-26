import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { feedbackCategories, feedbackStatuses } from "@/lib/app-feedback-shared";

export const newFeedbackSchema = z.object({
  title: z.string().trim().min(5).max(160), body: z.string().trim().min(10).max(4000),
  category: z.enum(feedbackCategories)
}).strict();
export const feedbackReplySchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
export const feedbackStatusSchema = z.object({ status: z.enum(feedbackStatuses), version: z.number().int().nonnegative() }).strict();
export const feedbackPageSchema = z.coerce.number().int().min(1).max(10000);
export const feedbackAuthor = { select: { id: true, name: true } } as const;
export const feedbackInclude = { author: feedbackAuthor, _count: { select: { entries: true } } } as const;
export class FeedbackError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function feedbackJson(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new FeedbackError("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 24000) { await reader.cancel(); throw new FeedbackError("Request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new FeedbackError("Send valid JSON."); }
}

// Apply the same active-account and role check to every read and mutation.
export async function withAppFeedback(req: NextRequest, handler: (userId: string) => Promise<NextResponse>) {
  let response: NextResponse;
  try {
    const user = await getSessionUser(req);
    if (!user) throw new FeedbackError("Sign in to use App Feedback.", 401);
    if (!hasPermission(user.role, "app-feedback:manage")) throw new FeedbackError("App Feedback is private to administrators.", 403);
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      const expected = new URL(process.env.APP_BASE_URL || req.url).origin;
      if (origin && origin !== expected) throw new FeedbackError("Request origin is not allowed.", 403);
      const limit = checkRateLimit({ namespace: "app-feedback:write", key: user.id, limit: 60, windowMs: 60000 });
      if (!limit.ok) {
        const limited = rateLimitResponse(limit);
        limited.headers.set("Cache-Control", "private, no-store");
        limited.headers.set("Vary", "Cookie");
        return limited;
      }
    }
    response = await handler(user.id);
  } catch (error) {
    response = NextResponse.json({ error: error instanceof FeedbackError ? error.message : "App Feedback is temporarily unavailable. Please try again." },
      { status: error instanceof FeedbackError ? error.status : 500 });
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
