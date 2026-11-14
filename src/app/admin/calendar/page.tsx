import { BookingManagementCalendar } from "@/components/BookingManagementCalendar";
export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; booking?: string }> }) {
  const query = await searchParams;
  return <section className="grid"><header className="card coastal-hero grid"><span className="kicker">House desk</span><h1>Booking calendar</h1><p className="lead">Every room, every stay. Review requests and manage changes without losing the bigger picture.</p></header><BookingManagementCalendar adminMode initialDate={query.date} initialBookingId={query.booking} /></section>;
}
