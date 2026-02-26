import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  return req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const overdueSubscriptions = await prisma.subscription.findMany({
    where: {
      reminderEnabled: true,
      OR: [
        { nextDueDate: { lte: now } },
        { arrearsAmount: { gt: 0 } }
      ]
    },
    include: {
      user: true
    }
  });

  let sent = 0;

  for (const subscription of overdueSubscriptions) {
    if (!subscription.user.email) {
      continue;
    }

    await sendMail({
      to: subscription.user.email,
      subject: "Reebok House subscription reminder",
      text: [
        `Hi ${subscription.user.name},`,
        "",
        "This is a reminder that your Reebok member subscription may be due or in arrears.",
        `Monthly contribution: ZAR ${subscription.monthlyAmount}`,
        `Current arrears: ZAR ${subscription.arrearsAmount}`,
        subscription.nextDueDate ? `Due date: ${subscription.nextDueDate.toISOString().slice(0, 10)}` : "",
        "",
        "Please upload proof of payment or complete an online payment in the app."
      ]
        .filter(Boolean)
        .join("\n")
    });

    sent += 1;
  }

  return NextResponse.json({ sent, subscriptionsChecked: overdueSubscriptions.length });
}
