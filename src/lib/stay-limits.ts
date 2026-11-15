// Client-safe policy shared by booking forms and server validation.
export const MEMBER_MAX_STAY_NIGHTS = 10;
export const GUEST_MAX_STAY_NIGHTS = 90;

export function maxStayNights(source: string): number {
  return source === "INTERNAL" ? MEMBER_MAX_STAY_NIGHTS : GUEST_MAX_STAY_NIGHTS;
}

export function stayLengthMessage(source: string): string {
  return `Choose between 1 and ${maxStayNights(source)} nights${source === "INTERNAL" ? " for a member/family stay" : ""}.`;
}

export function dateAfterNights(start: string, nights: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return undefined;
  date.setUTCDate(date.getUTCDate() + nights);
  return date.toISOString().slice(0, 10);
}
