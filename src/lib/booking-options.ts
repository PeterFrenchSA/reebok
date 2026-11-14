export const memberCategories = [
  { key: "member", label: "Members", rate: "memberNightRate" },
  { key: "dependentWithMember", label: "Dependents with a member", rate: "dependentWithMemberNightRate" },
  { key: "dependentWithoutMember", label: "Dependents without a member", rate: "dependentWithoutMemberNightRate" },
  { key: "guestOfMember", label: "Guests of a member", rate: "guestOfMemberNightRate" },
  { key: "guestOfDependent", label: "Guests of a dependent", rate: "guestOfDependentNightRate" },
  { key: "mereFamily", label: "Other family (mere family)", rate: "mereFamilyNightRate" }
] as const;
export type MemberCategory = typeof memberCategories[number]["key"];
export type MemberCounts = Record<MemberCategory, number>;
export const emptyMemberCounts: MemberCounts = { member: 0, dependentWithMember: 0, dependentWithoutMember: 0, guestOfMember: 0, guestOfDependent: 0, mereFamily: 0 };
export type RoomOption = { id: string; name: string; code?: string; capacity: number; notes?: string | null; isBookable?: boolean };
export type RoomAllocation = { roomId: string; guestCount: number; guestLabel?: string | null };
export type CalendarBooking = { id: string; status: string; startDate: string; endDate: string; scope?: string; roomIds?: string[] };
export type CalendarAvailability = { today: string; horizon: string; bookings: CalendarBooking[]; rooms?: RoomOption[] };

export function roomHolds(bookings: CalendarBooking[], start: string, end: string, roomId?: string) {
  return bookings.filter((b) => b.startDate.slice(0, 10) < end && b.endDate.slice(0, 10) > start &&
    (!roomId || b.scope !== "ROOM_SPECIFIC" || !b.roomIds?.length || b.roomIds.includes(roomId)));
}
