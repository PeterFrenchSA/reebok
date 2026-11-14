import Link from "next/link";
import { AdminBookingPolicySettings } from "@/components/AdminBookingPolicySettings";
export default function BookingSettingsPage() { return <section className="grid"><header className="card coastal-hero grid"><Link href="/admin/bookings" className="text-action">Back to bookings</Link><h1>House notices & booking settings</h1><p className="lead">Keep the pet notice and guest information board up to date.</p></header><AdminBookingPolicySettings /></section>; }
