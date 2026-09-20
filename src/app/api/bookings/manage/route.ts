import { guestBreakdownSchema } from "@/lib/booking-guests";
import { assertReservation, BookingRuleError, dateOnly, dateValue, withBookingLock } from "@/lib/availability";
import { BookingAuditAction, BookingSource, BookingStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  buildManageBookingUrl,
  generateBookingManageToken,
  getAppBaseUrl,
  hashBookingManageToken,
  tokensMatch
} from "@/lib/booking-manage";
import { calculateNights } from "@/lib/booking";
import { renderEmailTemplate } from "@/lib/email-templates";
import { calculateBookingFees } from "@/lib/fees";
import { getApproverEmails, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";

const lookupSchema = z.object({
  reference: z.string().min(8),
  token: z.string().min(8).optional(),
  email: z.string().email().optional()
});

const updateSchema = lookupSchema.extend({
  startDate: dateOnly.transform(dateValue),
  endDate: dateOnly.transform(dateValue),
  totalGuests: z.number().int().positive().max(40),
  petCount: z.number().int().nonnegative().max(20).default(0),
  notes: z.string().max(2000).optional(),
  externalLeadName: z.string().max(120).optional(),
  externalLeadEmail: z.string().email().optional(),
  externalLeadPhone: z.string().max(50).optional()
});

type AccessResult = {
  booking: Prisma.BookingGetPayload<{
    include: { requestedBy: { select: { id: true; email: true; role: true } } };
  }>;
  actorLabel: string;
  actorId?: string;
  actorRole?: UserRole;
};

async function resolveAccess(req: NextRequest, payload: z.infer<typeof lookupSchema>): Promise<AccessResult | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: payload.reference },
    include: { requestedBy: { select: { id: true, email: true, role: true } } }
  });

  if (!booking) {
    return null;
  }

  const user = await getSessionUser(req);
  if (user && (hasPermission(user.role, "booking:manage") || booking.requestedById === user.id)) {
    return {
      booking,
      actorLabel: user.name ?? user.email ?? user.id,
      actorId: user.id,
      actorRole: user.role
    };
  }

  if (payload.token && tokensMatch(booking.manageToken, payload.token)) {
    return { booking, actorLabel: "Guest (magic link)" };
  }

  return null;
}

function asDateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const parsed = lookupSchema.safeParse({
    reference: req.nextUrl.searchParams.get("reference") ?? "",
    token: req.nextUrl.searchParams.get("token") ?? undefined,
    email: req.nextUrl.searchParams.get("email") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    namespace: "bookings:manage:get",
    key: rateLimitKey(req, parsed.data.reference),
    limit: 60,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const access = await resolveAccess(req, parsed.data);
  if (!access) {
    return NextResponse.json({ error: "Booking not found or access denied" }, { status: 404 });
  }

  const booking = access.booking;
  return NextResponse.json({
    booking: {
      id: booking.id,
      source: booking.source,
      scope: booking.scope,
      status: booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      nights: booking.nights,
      totalGuests: booking.totalGuests,
      petCount: booking.petCount,
      notes: booking.notes,
      externalLeadName: booking.externalLeadName,
      externalLeadEmail: booking.externalLeadEmail,
      externalLeadPhone: booking.externalLeadPhone,
      currency: booking.currency,
      totalAmount: booking.totalAmount
    }
  });
}

export async function POST(req: NextRequest) {
  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.email) return NextResponse.json({ error: "Reference and email are required." }, { status: 400 });
  const limit = checkRateLimit({ namespace: "bookings:manage:link", key: rateLimitKey(req), limit: 5, windowMs: 15 * 60000 });
  if (!limit.ok) return rateLimitResponse(limit);
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) return NextResponse.json({ error: "Email delivery is unavailable. Please contact an administrator." }, { status: 503 });
  const booking = await prisma.booking.findUnique({ where: { id: parsed.data.reference }, include: { requestedBy: { select: { email: true } } } });
  const email = parsed.data.email.toLowerCase();
  if (booking && [booking.externalLeadEmail, booking.requestedBy?.email].some((address) => address?.toLowerCase() === email)) {
    const token = generateBookingManageToken();
    await prisma.booking.update({ where: { id: booking.id }, data: { manageToken: hashBookingManageToken(token) } });
    await sendMail({ to: email, subject: "Manage your Reebok booking", text: `Open this private link to manage your booking:\n${buildManageBookingUrl(booking.id, token)}\nDo not share this link.` });
  }
  return NextResponse.json({ message: "If the reference and email match, a private management link has been emailed to you." });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    namespace: "bookings:manage:patch",
    key: rateLimitKey(req, parsed.data.reference),
    limit: 30,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const access = await resolveAccess(req, parsed.data);
  if (!access) {
    return NextResponse.json({ error: "Booking not found or access denied" }, { status: 404 });
  }

  const existing = access.booking;
  if (existing.status === BookingStatus.CANCELLED) {
    return NextResponse.json({ error: "Cancelled bookings cannot be edited." }, { status: 400 });
  }

  const startDate = parsed.data.startDate;
  const endDate = parsed.data.endDate;
  const nights = calculateNights(startDate, endDate);
  if (nights <= 0) {
    return NextResponse.json({ error: "Booking must be at least one night." }, { status: 400 });
  }

  let requiresReapproval = existing.status !== BookingStatus.PENDING;
  let updated;
  try {
  updated = await withBookingLock(async (tx) => {
    const current = await tx.booking.findUnique({ where: { id: existing.id }, include: { roomAllocations: true } });
    if (!current || current.status === BookingStatus.CANCELLED) throw new BookingRuleError("Cancelled bookings cannot be edited.", 409);
    await assertReservation(tx, { ...current, startDate, endDate, totalGuests: parsed.data.totalGuests });
    requiresReapproval = current.status !== BookingStatus.PENDING;
    let totalAmount: Prisma.Decimal | number | string | null = current.totalAmount;
    let feeSnapshot: Prisma.InputJsonValue | undefined =
      current.feeSnapshot === null ? undefined : (current.feeSnapshot as Prisma.InputJsonValue);

    const changedStay = current.startDate.getTime() !== startDate.getTime() || current.endDate.getTime() !== endDate.getTime() || current.totalGuests !== parsed.data.totalGuests;
    const counts = guestBreakdownSchema.safeParse(current.guestBreakdown);
    if (changedStay && (!counts.success || Object.values(counts.data).reduce((a, b) => a + b, 0) !== parsed.data.totalGuests)) {
      throw new BookingRuleError("This change needs an updated guest-category breakdown. Please contact an administrator or submit a new request.");
    }
    if (changedStay && counts.success) {
      const feeConfig =
        (await tx.feeConfig.findFirst({
          where: {
            isActive: true,
            effectiveFrom: { lte: startDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }]
          },
          orderBy: { effectiveFrom: "desc" }
        })) ?? (await tx.feeConfig.create({ data: {} }));

      const seasonalRates = await tx.seasonalRate.findMany({ where: { feeConfigId: feeConfig.id, enabled: true } });
      const breakdown = calculateBookingFees(
        {
          source: current.source === BookingSource.EXTERNAL_PUBLIC ? "EXTERNAL_PUBLIC" : "INTERNAL",
          startDate,
          nights,
          counts: counts.data
        },
        feeConfig,
        seasonalRates
      );
      totalAmount = breakdown.total;
      feeSnapshot = breakdown as Prisma.InputJsonValue;
    }

    const booking = await tx.booking.update({
      where: { id: existing.id },
      data: {
        startDate,
        endDate,
        nights,
        totalGuests: parsed.data.totalGuests,
        petCount: parsed.data.petCount,
        notes: parsed.data.notes,
        status: BookingStatus.PENDING,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        externalLeadName: parsed.data.externalLeadName,
        externalLeadEmail: parsed.data.externalLeadEmail,
        externalLeadPhone: parsed.data.externalLeadPhone,
        totalAmount,
        feeSnapshot
      },
      include: {
        requestedBy: { select: { name: true, email: true } }
      }
    });

    await tx.bookingAuditLog.create({
      data: {
        bookingId: existing.id,
        actorId: access.actorId,
        actorRole: access.actorRole,
        action: BookingAuditAction.COMMENT,
        comment: requiresReapproval
          ? `Booking updated by ${access.actorLabel}; reset to pending approval.`
          : `Booking updated by ${access.actorLabel}.`
      }
    });

    return booking;
  });

  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const requesterEmail = updated.requestedBy?.email ?? updated.externalLeadEmail ?? parsed.data.email;
  const approverEmails = getApproverEmails();
  const needsManageLink = Boolean(requesterEmail) || approverEmails.length > 0;
  let manageUrl = buildManageBookingUrl(updated.id, undefined, requesterEmail ?? undefined);

  if (needsManageLink) {
    const rawManageToken = generateBookingManageToken();
    await prisma.booking.update({
      where: { id: updated.id },
      data: { manageToken: hashBookingManageToken(rawManageToken) }
    });
    manageUrl = buildManageBookingUrl(updated.id, rawManageToken, requesterEmail ?? undefined);
  }

  if (requesterEmail) {
    const template = await renderEmailTemplate("BOOKING_REQUEST_RECEIVED", {
      BOOKING_REFERENCE: updated.id,
      START_DATE: asDateLabel(updated.startDate),
      END_DATE: asDateLabel(updated.endDate),
      TOTAL_GUESTS: String(updated.totalGuests),
      PET_COUNT: String(updated.petCount),
      CURRENCY: updated.currency,
      TOTAL_AMOUNT: String(updated.totalAmount ?? 0),
      SOURCE: updated.source,
      SCOPE: updated.scope,
      REJECTION_REASON: "",
      MANAGE_URL: manageUrl,
      ADMIN_BOOKINGS_URL: `${getAppBaseUrl()}/admin/bookings`
    });

    await sendMail({ to: requesterEmail, subject: template.subject, text: template.text });
  }

  if (approverEmails.length > 0) {
    const template = await renderEmailTemplate("BOOKING_APPROVAL_REQUIRED", {
      BOOKING_REFERENCE: updated.id,
      START_DATE: asDateLabel(updated.startDate),
      END_DATE: asDateLabel(updated.endDate),
      TOTAL_GUESTS: String(updated.totalGuests),
      PET_COUNT: String(updated.petCount),
      CURRENCY: updated.currency,
      TOTAL_AMOUNT: String(updated.totalAmount ?? 0),
      SOURCE: updated.source,
      SCOPE: updated.scope,
      REJECTION_REASON: "",
      MANAGE_URL: manageUrl,
      ADMIN_BOOKINGS_URL: `${getAppBaseUrl()}/admin/bookings`
    });

    await sendMail({ to: approverEmails, subject: template.subject, text: template.text });
  }

  const { manageToken: _manageToken, ...sanitizedBooking } = updated;

  return NextResponse.json({
    booking: sanitizedBooking,
    message: requiresReapproval
      ? "Booking updated and moved back to pending approval."
      : "Booking updated and still pending approval."
  });
}
