export const BOOKINGS_CHANGED = "reebok:bookings-changed";

// Keep independently mounted approval, active and history panels in sync.
export function notifyBookingsChanged() {
  window.dispatchEvent(new Event(BOOKINGS_CHANGED));
}
