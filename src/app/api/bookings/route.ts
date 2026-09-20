import { guestBreakdownSchema } from "@/lib/booking-guests";
import { assertReservation, BookingRuleError, dateOnly, dateValue, withBookingLock } from "@/lib/availability";
import {
  BookingAuditAction,
  BookingScope,
  BookingSource,
  BookingStatus,
  GuestType,
  Prisma
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateNights } from "@/lib/booking";
import {
  buildManageBookingUrl,
  generateBookingManageToken,
  getAppBaseUrl,
  hashBookingManageToken
} from "@/lib/booking-manage";
import { renderEmailTemplate } from "@/lib/email-templates";
import { calculateBookingFees } from "@/lib/fees";
import { getSessionUser } from "@/lib/auth";
import { getApproverEmails, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac";

const bookingGuestSchema = z.object({
  fullName: z.string().min(1),
  age: z.number().int().nonnegative().optional(),
  guestType: z.nativeEnum(GuestType),
  userId: z.string().optional(),
  isPrimaryContact: z.boolean().optional()
});

const roomAllocationSchema = z.object({
  roomId: z.string().min(1),
  guestLabel: z.string().optional(),
  guestCount: z.number().int().positive().max(20)
});

const createBookingSchema = z.object({
  source: z.enum(["INTERNAL", "EXTERNAL_PUBLIC"]).optional(),
  scope: z.nativeEnum(BookingScope).optional(),
  startDate: dateOnly.transform(dateValue),
  endDate: dateOnly.transform(dateValue),
  petCount: z.number().int().nonnegative().max(20).default(0),
  notes: z.string().max(2000).optional(),
  externalLeadName: z.string().max(120).optional(),
  externalLeadEmail: z.string().email().optional(),
  externalLeadPhone: z.string().max(50).optional(),
  guests: z.array(bookingGuestSchema).optional(),
  guestBreakdown: guestBreakdownSchema,
  roomAllocations: z.array(roomAllocationSchema).optional()
});

function sumGuests(payload: z.infer<typeof createBookingSchema>): number {
  if (payload.guests && payload.guests.length > 0) {
    return payload.guests.length;
  }

  const b = payload.guestBreakdown;
  return (
    b.member +
    b.dependentWithMember +
    b.dependentWithoutMember +
    b.guestOfMember +
    b.guestOfDependent +
    b.mereFamily +
    b.visitorAdult +
    b.visitorChildUnder6
  );
}

function asDateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function getActiveFeeConfig(bookingStartDate: Date) {
  let feeConfig = await prisma.feeConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: bookingStartDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: bookingStartDate } }]
    },
    orderBy: { effectiveFrom: "desc" }
  });

  if (!feeConfig) {
    feeConfig = await prisma.feeConfig.create({ data: {} });
  }

  const seasonalRates = await prisma.seasonalRate.findMany({
    where: { feeConfigId: feeConfig.id, enabled: true }
  });

  return { feeConfig, seasonalRates };
}

const adminBookingInclude = {
  requestedBy: { select: { name: true, email: true } },
  approvedBy: { select: { name: true, email: true, role: true } },
  guests: true,
  roomAllocations: {
    include: { room: true }
  },
  bookingAuditLogs: {
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } }
    },
    orderBy: { createdAt: "asc" as const }
  }
} as const;

const ownBookingSelect = {
  id: true,
  source: true,
  scope: true,
  status: true,
  startDate: true,
  endDate: true,
  nights: true,
  totalGuests: true,
  petCount: true,
  currency: true,
  totalAmount: true
} as const;

const memberSummarySelect = {
  ...ownBookingSelect,
  requestedById: true
} as const;

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status") as BookingStatus | null;
  const statusFilter = statusParam && Object.values(BookingStatus).includes(statusParam)
    ? statusParam
    : undefined;
  const take = Number(req.nextUrl.searchParams.get("take") ?? 200);
  const mineOnly = req.nextUrl.searchParams.get("mineOnly") === "true";

  const isAdmin = hasPermission(user.role, "booking:manage") || hasPermission(user.role, "booking:approve");
  const canSeeSharedActiveBookings = hasPermission(user.role, "booking:create:family");

  const where = isAdmin
    ? { status: statusFilter ?? undefined, requestedById: mineOnly ? user.id : undefined }
    : mineOnly || !canSeeSharedActiveBookings
      ? {
          requestedById: user.id,
          status: statusFilter ?? undefined
        }
      : {
          OR: [
            { requestedById: user.id },
            { status: BookingStatus.APPROVED }
          ],
          status: statusFilter ?? undefined
        };

  const safeTake = take > 0 && take <= 1000 ? take : 200;

  if (isAdmin) {
    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: adminBookingInclude,
      take: safeTake
    });

    const sanitizedBookings = bookings.map((booking) => {
      const { manageToken: _manageToken, ...sanitizedBooking } = booking;
      return sanitizedBooking;
    });

    return NextResponse.json({ bookings: sanitizedBookings });
  }

  if (mineOnly || !canSeeSharedActiveBookings) {
    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startDate: "desc" },
      select: ownBookingSelect,
      take: safeTake
    });

    return NextResponse.json({ bookings });
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { startDate: "desc" },
    select: memberSummarySelect,
    take: safeTake
  });

  const summaryBookings = bookings.map(({ requestedById, ...booking }, index) =>
    requestedById === user.id
      ? booking
      : {
          ...booking,
          id: `house-booking-${index + 1}`
        }
  );

  return NextResponse.json({ bookings: summaryBookings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const user = await getSessionUser(req);
    const payload = parsed.data;

    const source = payload.source
      ? payload.source === "INTERNAL"
        ? BookingSource.INTERNAL
        : BookingSource.EXTERNAL_PUBLIC
      : user && hasPermission(user.role, "booking:create:family")
        ? BookingSource.INTERNAL
        : BookingSource.EXTERNAL_PUBLIC;

    if (source === BookingSource.INTERNAL) {
      if (!user || !hasPermission(user.role, "booking:create:family")) {
        return NextResponse.json(
          { error: "Only members or appointed administrators can create internal bookings" },
          { status: 403 }
        );
      }
    }

    const bookingRateLimit = checkRateLimit({
      namespace: "bookings:create",
      key: rateLimitKey(req, user?.id ?? payload.externalLeadEmail ?? "anonymous"),
      limit: source === BookingSource.EXTERNAL_PUBLIC ? 8 : 30,
      windowMs: source === BookingSource.EXTERNAL_PUBLIC ? 60 * 60 * 1000 : 15 * 60 * 1000
    });
    if (!bookingRateLimit.ok) {
      return rateLimitResponse(bookingRateLimit);
    }

    const startDate = payload.startDate;
    const endDate = payload.endDate;
    const nights = calculateNights(startDate, endDate);

    if (nights <= 0) {
      return NextResponse.json({ error: "Booking must be at least one night" }, { status: 400 });
    }

    const pricedGuests = Object.values(payload.guestBreakdown).reduce((sum, count) => sum + count, 0);
    if (payload.guests?.length && payload.guests.length !== pricedGuests) return NextResponse.json({ error: "Guest list must match the pricing breakdown." }, { status: 400 });
    const invalidCategories = source === BookingSource.EXTERNAL_PUBLIC
      ? Object.entries(payload.guestBreakdown).some(([key, value]) => value > 0 && !["visitorAdult", "visitorChildUnder6"].includes(key))
      : payload.guestBreakdown.visitorAdult > 0 || payload.guestBreakdown.visitorChildUnder6 > 0;
    if (invalidCategories) return NextResponse.json({ error: "Guest categories do not match the booking type." }, { status: 400 });
    const totalGuests = sumGuests(payload);
    if (totalGuests <= 0) {
      return NextResponse.json({ error: "At least one guest is required" }, { status: 400 });
    }

    const scope = source === BookingSource.EXTERNAL_PUBLIC
      ? BookingScope.WHOLE_HOUSE
      : payload.scope ?? BookingScope.WHOLE_HOUSE;

    if (scope === BookingScope.ROOM_SPECIFIC && source === BookingSource.EXTERNAL_PUBLIC) {
      return NextResponse.json(
        { error: "External bookings can only reserve the whole house" },
        { status: 400 }
      );
    }

    const { feeConfig, seasonalRates } = await getActiveFeeConfig(startDate);
    const feeBreakdown = calculateBookingFees(
      {
        source: source === BookingSource.EXTERNAL_PUBLIC ? "EXTERNAL_PUBLIC" : "INTERNAL",
        startDate,
        nights,
        counts: payload.guestBreakdown
      },
      feeConfig,
      seasonalRates
    );

    const rawManageToken = generateBookingManageToken();
    const manageToken = hashBookingManageToken(rawManageToken);

    const booking = await withBookingLock(async (tx) => {
      await assertReservation(tx, { startDate, endDate, scope, totalGuests, roomAllocations: payload.roomAllocations });
      return tx.booking.create({
      data: {
        source,
        scope,
        status: BookingStatus.PENDING,
        startDate,
        endDate,
        nights,
        totalGuests,
        petCount: payload.petCount,
        guestBreakdown: payload.guestBreakdown,
        notes: payload.notes,
        manageToken,
        requestedById: user?.id,
        externalLeadName: payload.externalLeadName,
        externalLeadEmail: payload.externalLeadEmail,
        externalLeadPhone: payload.externalLeadPhone,
        feeSnapshot: feeBreakdown as Prisma.InputJsonValue,
        totalAmount: feeBreakdown.total,
        currency: feeBreakdown.currency,
        guests: payload.guests?.length
          ? {
              create: payload.guests.map((guest) => ({
                userId: guest.userId,
                fullName: guest.fullName,
                age: guest.age,
                guestType: guest.guestType,
                isPrimaryContact: guest.isPrimaryContact ?? false
              }))
            }
          : undefined,
        roomAllocations:
          scope === BookingScope.ROOM_SPECIFIC && payload.roomAllocations?.length
            ? {
                create: payload.roomAllocations.map((allocation) => ({
                  roomId: allocation.roomId,
                  guestLabel: allocation.guestLabel,
                  guestCount: allocation.guestCount
                }))
              }
            : undefined,
        bookingAuditLogs: {
          create: {
            actorId: user?.id,
            actorRole: user?.role,
            action: BookingAuditAction.CREATED,
            comment:
              source === BookingSource.EXTERNAL_PUBLIC
                ? "Public booking request submitted."
                : "Member booking request submitted."
          }
        }
      },
      include: {
        requestedBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true, email: true, role: true } },
        guests: true,
        roomAllocations: { include: { room: true } },
        bookingAuditLogs: {
          include: {
            actor: { select: { id: true, name: true, email: true, role: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    });

    const requesterEmail = booking.requestedBy?.email ?? booking.externalLeadEmail;
    const manageUrl = buildManageBookingUrl(booking.id, rawManageToken, requesterEmail ?? undefined);
    const commonTemplateContext = {
      BOOKING_REFERENCE: booking.id,
      START_DATE: asDateLabel(booking.startDate),
      END_DATE: asDateLabel(booking.endDate),
      TOTAL_GUESTS: String(booking.totalGuests),
      PET_COUNT: String(booking.petCount),
      CURRENCY: booking.currency,
      TOTAL_AMOUNT: String(booking.totalAmount ?? 0),
      SOURCE: booking.source,
      SCOPE: booking.scope,
      REJECTION_REASON: "",
      MANAGE_URL: manageUrl,
      ADMIN_BOOKINGS_URL: `${getAppBaseUrl()}/admin/bookings`
    };

    if (requesterEmail) {
      const requesterTemplate = await renderEmailTemplate("BOOKING_REQUEST_RECEIVED", commonTemplateContext);
      await sendMail({
        to: requesterEmail,
        subject: requesterTemplate.subject,
        text: requesterTemplate.text
      });
    }

    const approverEmails = getApproverEmails();
    if (approverEmails.length > 0) {
      const approverTemplate = await renderEmailTemplate("BOOKING_APPROVAL_REQUIRED", commonTemplateContext);
      await sendMail({
        to: approverEmails,
        subject: approverTemplate.subject,
        text: approverTemplate.text
      });
    }

    const { manageToken: _manageToken, ...sanitizedBooking } = booking;

    return NextResponse.json({
      booking: sanitizedBooking,
      status: "PENDING_APPROVAL",
      feeBreakdown
    });
  } catch (error) {
    if (error instanceof BookingRuleError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
