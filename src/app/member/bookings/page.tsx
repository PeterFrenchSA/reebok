import Link from "next/link";
import { MemberBookingsPanel } from "@/components/MemberBookingsPanel";
export default function MyBookingsPage() { return <section className="grid"><header className="card coastal-hero grid"><span className="kicker">Your accommodation</span><h1>My bookings</h1><p className="lead">Upcoming stays and past visits, all in one place.</p><Link href="/member/book" className="btn-primary inline-action">Create New Booking</Link></header><MemberBookingsPanel /></section>; }
