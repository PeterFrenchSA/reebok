import { BookingScope, BookingStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const PROPERTY_TIMEZONE = "Africa/Johannesburg";
export const MAX_STAY_NIGHTS = 90;
const DAY = 86_400_000;
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real date in YYYY-MM-DD format.");

export function propertyToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PROPERTY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dateValue(value: string): Date { return new Date(`${value}T00:00:00Z`); }
export function addDays(value: string, days: number): string {
  return new Date(dateValue(value).getTime() + days * DAY).toISOString().slice(0, 10);
}
export function bookingHorizon(today = propertyToday()): string {
  // An explicit day-based horizon avoids month-end rollover differences between clients.
  return addDays(today, 548);
}

export class BookingRuleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateStay(start: string, end: string, today = propertyToday()) {
  if (!dateOnly.safeParse(start).success || !dateOnly.safeParse(end).success) throw new BookingRuleError("Use real dates in YYYY-MM-DD format.");
  const nights = (dateValue(end).getTime() - dateValue(start).getTime()) / DAY;
  if (nights < 1 || nights > MAX_STAY_NIGHTS) throw new BookingRuleError(`Choose between 1 and ${MAX_STAY_NIGHTS} nights.`);
  if (start < today || end > bookingHorizon(today)) throw new BookingRuleError("Dates must be between today and the published booking horizon.");
  return nights;
}

export const occupancySelect = {
  scope: true, status: true, startDate: true, endDate: true,
  roomAllocations: { select: { roomId: true } }
} as const;
type Occupancy = Prisma.BookingGetPayload<{ select: typeof occupancySelect }>;
export function blocksRooms(booking: Pick<Occupancy, "scope" | "roomAllocations">, roomIds: string[]): boolean {
  // Legacy room bookings without allocations must fail closed until an admin repairs them.
  return roomIds.length === 0 || booking.scope === BookingScope.WHOLE_HOUSE || booking.roomAllocations.length === 0 ||
    booking.roomAllocations.some((room) => roomIds.includes(room.roomId));
}
export function occupancyState(bookings: Array<Pick<Occupancy, "status">>) {
  const pending = bookings.some((b) => b.status === BookingStatus.PENDING);
  const confirmed = bookings.some((b) => b.status === BookingStatus.APPROVED);
  return { available: !pending && !confirmed, pending, confirmed };
}

type Reader = Pick<Prisma.TransactionClient, "room" | "booking">;
export async function getAvailability(start: string, end: string, roomIds: string[] = [], db: Reader = prisma) {
  const nights = validateStay(start, end);
  const rooms = await db.room.findMany({ where: { isBookable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, capacity: true } });
  if (new Set(roomIds).size !== roomIds.length || roomIds.some((id) => !rooms.some((room) => room.id === id))) throw new BookingRuleError("Choose valid, bookable rooms without duplicates.");
  const bookings = await db.booking.findMany({ where: {
    status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
    startDate: { lt: dateValue(end) }, endDate: { gt: dateValue(start) }
  }, select: occupancySelect });
  return {
    startDate: start, endDate: end, nights, timezone: PROPERTY_TIMEZONE,
    scope: roomIds.length ? "ROOM_SPECIFIC" as const : "WHOLE_HOUSE" as const,
    selectedRoomIds: roomIds, ...occupancyState(bookings.filter((b) => blocksRooms(b, roomIds))),
    rooms: rooms.map((room) => ({ ...room, ...occupancyState(bookings.filter((b) => blocksRooms(b, [room.id]))) })),
    horizon: bookingHorizon()
  };
}

export async function withBookingLock<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // One property: serialize availability-changing writes across every app instance.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(741927, 1)`;
    return work(tx);
  }, { maxWait: 10000, timeout: 15000 });
}

export async function assertReservation(tx: Prisma.TransactionClient, input: {
  id?: string; startDate: Date; endDate: Date; scope: BookingScope; totalGuests: number;
  roomAllocations?: Array<{ roomId: string; guestCount: number }>; allowHistorical?: boolean;
}) {
  if (input.allowHistorical) {
    if (input.endDate <= input.startDate) throw new BookingRuleError("Check-out must be after check-in.");
  } else validateStay(input.startDate.toISOString().slice(0, 10), input.endDate.toISOString().slice(0, 10));
  const allocations = input.roomAllocations ?? [];
  if (input.scope === BookingScope.ROOM_SPECIFIC) {
    if (!allocations.length || new Set(allocations.map((a) => a.roomId)).size !== allocations.length) throw new BookingRuleError("Choose at least one room, without duplicates.");
    const rooms = await tx.room.findMany({ where: { id: { in: allocations.map((a) => a.roomId) }, isBookable: true } });
    if (rooms.length !== allocations.length || allocations.some((a) => a.guestCount < 1 || a.guestCount > (rooms.find((r) => r.id === a.roomId)?.capacity ?? 0))) throw new BookingRuleError("Room allocation exceeds capacity or uses an unavailable room.");
    if (allocations.reduce((sum, a) => sum + a.guestCount, 0) !== input.totalGuests) throw new BookingRuleError("Room allocations must account for every guest.");
  }
  const bookings = await tx.booking.findMany({ where: {
    id: input.id ? { not: input.id } : undefined,
    status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED] },
    startDate: { lt: input.endDate }, endDate: { gt: input.startDate }
  }, select: occupancySelect });
  const ids = input.scope === BookingScope.ROOM_SPECIFIC ? allocations.map((a) => a.roomId) : [];
  if (bookings.some((b) => blocksRooms(b, ids))) throw new BookingRuleError("These rooms or dates are held by a pending or confirmed booking.", 409);
}
