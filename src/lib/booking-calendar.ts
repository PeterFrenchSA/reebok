import type { UserRole } from "@prisma/client";
import { hasPermission } from "./rbac";

export type CalendarEntry = {
  id: string; startDate: string; endDate: string; status: string; scope: string;
  displayName: string; totalGuests: number; petCount: number; isOwnBooking: boolean;
  rooms: Array<{ id: string; name: string; guestCount: number }>;
};
export type BookingCalendarData = {
  today: string; start: string; end: string; admin: boolean;
  rooms: Array<{ id: string; name: string; capacity: number; isBookable: boolean }>;
  bookings: CalendarEntry[];
};
export function sharedBookingName(booking: { requestedBy: { name: string; role: UserRole } | null }) {
  return booking.requestedBy && hasPermission(booking.requestedBy.role, "booking:create:family")
    ? booking.requestedBy.name : "Guest stay";
}
export function occupiesDay(booking: Pick<CalendarEntry, "startDate" | "endDate">, day: string) {
  return booking.startDate.slice(0, 10) <= day && booking.endDate.slice(0, 10) > day;
}
export function occupiesRoom(booking: Pick<CalendarEntry, "scope" | "rooms">, roomId: string) {
  return booking.scope === "WHOLE_HOUSE" || booking.rooms.length === 0 || booking.rooms.some((room) => room.id === roomId);
}
