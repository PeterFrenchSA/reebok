import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { EMAIL_TEMPLATE_KEYS, listEmailTemplates, updateEmailTemplate } from "@/lib/email-templates";
import { hasPermission } from "@/lib/rbac";

const updateSchema = z.object({
  key: z.enum(EMAIL_TEMPLATE_KEYS),
  subjectTemplate: z.string().trim().min(3).max(500),
  bodyTemplate: z.string().trim().min(10).max(10000)
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Manage bookings permission required" }, { status: 403 });
  }

  const templates = await listEmailTemplates();
  return NextResponse.json({ templates });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "booking:manage")) {
    return NextResponse.json({ error: "Manage bookings permission required" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await updateEmailTemplate(parsed.data.key, {
    subjectTemplate: parsed.data.subjectTemplate,
    bodyTemplate: parsed.data.bodyTemplate
  });

  return NextResponse.json({ template });
}
