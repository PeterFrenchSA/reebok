import { prisma } from "@/lib/prisma";

export const EMAIL_TEMPLATE_KEYS = [
  "BOOKING_REQUEST_RECEIVED",
  "BOOKING_APPROVAL_REQUIRED",
  "BOOKING_APPROVED",
  "BOOKING_REJECTED"
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

type EmailTemplateDefault = {
  key: EmailTemplateKey;
  name: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
};

const DEFAULT_TEMPLATES: Record<EmailTemplateKey, EmailTemplateDefault> = {
  BOOKING_REQUEST_RECEIVED: {
    key: "BOOKING_REQUEST_RECEIVED",
    name: "Booking Request Received",
    description: "Sent to the requester immediately after a booking is submitted.",
    subjectTemplate: "Booking request received ({{START_DATE}} to {{END_DATE}})",
    bodyTemplate: [
      "Your booking request has been received and is pending admin approval.",
      "",
      "Booking reference: {{BOOKING_REFERENCE}}",
      "Dates: {{START_DATE}} to {{END_DATE}}",
      "Guests: {{TOTAL_GUESTS}}",
      "Pets: {{PET_COUNT}}",
      "Estimated amount: {{CURRENCY}} {{TOTAL_AMOUNT}}",
      "",
      "Manage your booking: {{MANAGE_URL}}"
    ].join("\n")
  },
  BOOKING_APPROVAL_REQUIRED: {
    key: "BOOKING_APPROVAL_REQUIRED",
    name: "Booking Approval Required",
    description: "Sent to approvers when a booking needs review.",
    subjectTemplate: "Booking approval required: {{START_DATE}} to {{END_DATE}}",
    bodyTemplate: [
      "A booking requires approval.",
      "",
      "Booking reference: {{BOOKING_REFERENCE}}",
      "Source: {{SOURCE}}",
      "Scope: {{SCOPE}}",
      "Dates: {{START_DATE}} to {{END_DATE}}",
      "Guests: {{TOTAL_GUESTS}}",
      "Pets: {{PET_COUNT}}",
      "Estimated amount: {{CURRENCY}} {{TOTAL_AMOUNT}}",
      "",
      "Admin review page: {{ADMIN_BOOKINGS_URL}}"
    ].join("\n")
  },
  BOOKING_APPROVED: {
    key: "BOOKING_APPROVED",
    name: "Booking Approved",
    description: "Sent to the requester when a booking is approved.",
    subjectTemplate: "Booking approved ({{START_DATE}} to {{END_DATE}})",
    bodyTemplate: [
      "Your booking has been approved.",
      "",
      "Booking reference: {{BOOKING_REFERENCE}}",
      "Dates: {{START_DATE}} to {{END_DATE}}",
      "Amount due: {{CURRENCY}} {{TOTAL_AMOUNT}}",
      "",
      "Manage your booking: {{MANAGE_URL}}"
    ].join("\n")
  },
  BOOKING_REJECTED: {
    key: "BOOKING_REJECTED",
    name: "Booking Rejected",
    description: "Sent to the requester when a booking is rejected.",
    subjectTemplate: "Booking declined ({{START_DATE}} to {{END_DATE}})",
    bodyTemplate: [
      "Your booking was not approved.",
      "",
      "Booking reference: {{BOOKING_REFERENCE}}",
      "Reason: {{REJECTION_REASON}}",
      "",
      "Manage your booking: {{MANAGE_URL}}"
    ].join("\n")
  }
};

function renderTokens(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => context[key] ?? "");
}

async function ensureTemplate(key: EmailTemplateKey) {
  const defaults = DEFAULT_TEMPLATES[key];
  return prisma.emailTemplate.upsert({
    where: { key },
    update: {},
    create: {
      key: defaults.key,
      name: defaults.name,
      description: defaults.description,
      subjectTemplate: defaults.subjectTemplate,
      bodyTemplate: defaults.bodyTemplate
    }
  });
}

export async function listEmailTemplates() {
  await Promise.all(EMAIL_TEMPLATE_KEYS.map((key) => ensureTemplate(key)));
  return prisma.emailTemplate.findMany({ orderBy: { key: "asc" } });
}

export async function updateEmailTemplate(
  key: EmailTemplateKey,
  payload: { subjectTemplate: string; bodyTemplate: string }
) {
  const defaults = DEFAULT_TEMPLATES[key];
  return prisma.emailTemplate.upsert({
    where: { key },
    update: {
      subjectTemplate: payload.subjectTemplate,
      bodyTemplate: payload.bodyTemplate
    },
    create: {
      key: defaults.key,
      name: defaults.name,
      description: defaults.description,
      subjectTemplate: payload.subjectTemplate,
      bodyTemplate: payload.bodyTemplate
    }
  });
}

export async function renderEmailTemplate(key: EmailTemplateKey, context: Record<string, string>) {
  const template = await ensureTemplate(key);
  return {
    subject: renderTokens(template.subjectTemplate, context),
    text: renderTokens(template.bodyTemplate, context)
  };
}
