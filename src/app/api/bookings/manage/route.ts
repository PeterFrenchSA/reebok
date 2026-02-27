import { BookingAuditAction, BookingSource, BookingStatus, Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { buildManageBookingUrl, getAppBaseUrl, tokensMatch } from "@/lib/booking-manage";
import { calculateNights } from "@/lib/booking";
import { renderEmailTemplate } from "@/lib/email-templates";
import { calculateBookingFees } from "@/lib/fees";
import { getApproverEmails, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const lookupSchema = z.object({
  reference: z.string().min(8),
  token: z.string().min(8).optional(),
  email: z.string().email().optional()
});

const updateSchema = lookupSchema.extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
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

  if (payload.email) {
    const candidate = payload.email.toLowerCase();
    if (booking.externalLeadEmail?.toLowerCase() === candidate || booking.requestedBy?.email?.toLowerCase() === candidate) {
      return { booking, actorLabel: payload.email };
    }
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

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

  const overlap = await prisma.booking.findFirst({
    where: {
      id: { not: existing.id },
      status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
      startDate: { lt: endDate },
      endDate: { gt: startDate }
    },
    select: { id: true, startDate: true, endDate: true, status: true }
  });

  if (overlap) {
    return NextResponse.json(
      {
        error: "Booking dates overlap with an existing pending or approved booking",
        conflictingBooking: overlap
      },
      { status: 409 }
    );
  }

  const requiresReapproval = existing.status !== BookingStatus.PENDING;
  const updated = await prisma.$transaction(async (tx) => {
    let totalAmount: Prisma.Decimal | number | string | null = existing.totalAmount;
    let feeSnapshot: Prisma.InputJsonValue | undefined =
      existing.feeSnapshot === null ? undefined : (existing.feeSnapshot as Prisma.InputJsonValue);

    if (existing.source === BookingSource.EXTERNAL_PUBLIC) {
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
          source: "EXTERNAL_PUBLIC",
          startDate,
          nights,
          counts: {
            member: 0,
            dependentWithMember: 0,
            dependentWithoutMember: 0,
            guestOfMember: 0,
            guestOfDependent: 0,
            mereFamily: 0,
            visitorAdult: parsed.data.totalGuests,
            visitorChildUnder6: 0
          }
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

  const requesterEmail = updated.requestedBy?.email ?? updated.externalLeadEmail ?? parsed.data.email;
  const manageUrl = buildManageBookingUrl(updated.id, updated.manageToken ?? undefined, requesterEmail ?? undefined);

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

  const approverEmails = getApproverEmails();
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

  const sanitizedBooking = { ...updated } as typeof updated & { manageToken?: string | null };
  delete sanitizedBooking.manageToken;

  return NextResponse.json({
    booking: sanitizedBooking,
    message: requiresReapproval
      ? "Booking updated and moved back to pending approval."
      : "Booking updated and still pending approval."
  });
}
