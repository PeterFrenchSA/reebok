import nodemailer from "nodemailer";

export type MailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

export async function sendMail(payload: MailPayload): Promise<void> {
  const transport = createTransport();

  if (!transport) {
    console.warn("SMTP is not configured. Mail skipped.");
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });
}

export function getApproverEmails(): string[] {
  return (process.env.APPROVER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
