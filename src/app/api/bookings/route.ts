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
import { calculateBookingFees } from "@/lib/fees";
import { getSessionUser } from "@/lib/auth";
import { getApproverEmails, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
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

const guestBreakdownSchema = z
  .object({
    member: z.number().int().nonnegative().default(0),
    dependentWithMember: z.number().int().nonnegative().default(0),
    dependentWithoutMember: z.number().int().nonnegative().default(0),
    guestOfMember: z.number().int().nonnegative().default(0),
    guestOfDependent: z.number().int().nonnegative().default(0),
    mereFamily: z.number().int().nonnegative().default(0),
    visitorAdult: z.number().int().nonnegative().default(0),
    visitorChildUnder6: z.number().int().nonnegative().default(0)
  })
  .default({
    member: 0,
    dependentWithMember: 0,
    dependentWithoutMember: 0,
    guestOfMember: 0,
    guestOfDependent: 0,
    mereFamily: 0,
    visitorAdult: 0,
    visitorChildUnder6: 0
  });

const createBookingSchema = z.object({
  source: z.enum(["INTERNAL", "EXTERNAL_PUBLIC"]).optional(),
  scope: z.nativeEnum(BookingScope).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
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

  const where = isAdmin
    ? { status: statusFilter ?? undefined }
    : mineOnly
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

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: {
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
        orderBy: { createdAt: "asc" }
      }
    },
    take: take > 0 && take <= 1000 ? take : 200
  });

  return NextResponse.json({ bookings });
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
      : user && (user.role === "FAMILY_MEMBER" || user.role === "SHAREHOLDER" || user.role === "SUPER_ADMIN")
        ? BookingSource.INTERNAL
        : BookingSource.EXTERNAL_PUBLIC;

    if (source === BookingSource.INTERNAL) {
      if (!user || !hasPermission(user.role, "booking:create:family")) {
        return NextResponse.json(
          { error: "Only family members, shareholders, or super admins can create internal bookings" },
          { status: 403 }
        );
      }
    }

    const startDate = payload.startDate;
    const endDate = payload.endDate;
    const nights = calculateNights(startDate, endDate);

    if (nights <= 0) {
      return NextResponse.json({ error: "Booking must be at least one night" }, { status: 400 });
    }

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

    const overlap = await prisma.booking.findFirst({
      where: {
        status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
        startDate: { lt: endDate },
        endDate: { gt: startDate }
      },
      select: { id: true, status: true, startDate: true, endDate: true }
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

    const booking = await prisma.booking.create({
      data: {
        source,
        scope,
        status: BookingStatus.PENDING,
        startDate,
        endDate,
        nights,
        totalGuests,
        petCount: payload.petCount,
        notes: payload.notes,
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

    const approverEmails = getApproverEmails();
    if (approverEmails.length > 0) {
      await sendMail({
        to: approverEmails,
        subject: `Booking approval required: ${startDate.toISOString().slice(0, 10)} to ${endDate
          .toISOString()
          .slice(0, 10)}`,
        text: [
          "A new booking requires approval.",
          `Booking ID: ${booking.id}`,
          `Source: ${booking.source}`,
          `Scope: ${booking.scope}`,
          `Guests: ${booking.totalGuests}`,
          `Pets: ${booking.petCount}`,
          `Estimated amount: ${booking.currency} ${booking.totalAmount ?? 0}`
        ].join("\n")
      });
    }

    return NextResponse.json({
      booking,
      status: "PENDING_APPROVAL",
      feeBreakdown
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
