import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sharedBookingName } from "@/lib/booking-calendar";
import { ReportTab, SheetsError } from "@/lib/sheets-report";

const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";
const amount = (value: Prisma.Decimal | null) => value === null ? "" : Number(value);
const page = (cursor?: string) => ({ take: 1000, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
async function allRows<T extends { id: string }>(read: (cursor?: string) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  for (;;) {
    const batch = await read(result.at(-1)?.id);
    result.push(...batch);
    if (result.length > 50000) throw new SheetsError("A report exceeds 50,000 rows. Nothing was written; increase reporting capacity before retrying.", 422);
    if (batch.length < 1000) return result;
  }
}
export async function sheetsSnapshot(): Promise<ReportTab[]> {
  return prisma.$transaction(async (tx) => {
    const bookings = await allRows((cursor) => tx.booking.findMany({ ...page(cursor), select: {
      id: true, source: true, status: true, scope: true, startDate: true, endDate: true, nights: true, totalGuests: true, petCount: true, totalAmount: true, currency: true, createdAt: true, updatedAt: true,
      requestedBy: { select: { name: true, role: true } }, roomAllocations: { select: { guestCount: true, room: { select: { name: true } } } }
    } }));
    const expenses = await allRows((cursor) => tx.expense.findMany({ ...page(cursor), select: {
      id: true, title: true, category: true, supplier: true, invoiceNumber: true, amount: true, currency: true, serviceDate: true, dueDate: true, paidDate: true, createdAt: true, updatedAt: true
    } }));
    const payments = await allRows((cursor) => tx.payment.findMany({ ...page(cursor), select: {
      id: true, bookingId: true, amount: true, currency: true, method: true, status: true, reference: true, paidAt: true, periodStart: true, periodEnd: true, monthsCovered: true, createdAt: true,
      payer: { select: { name: true } }, subscriptionLinks: { select: { subscription: { select: { user: { select: { name: true } } } } } }
    } }));
    const fees = await allRows((cursor) => tx.subscription.findMany({ ...page(cursor), select: {
      id: true, userId: true, monthlyAmount: true, arrearsAmount: true, nextDueDate: true, lastPaymentDate: true, updatedAt: true, user: { select: { name: true, isActive: true } }
    } }));
    return [
      { key: "bookings", title: "Reebok - Bookings", headers: ["Reference", "Lead member / family", "Status", "Source", "Accommodation", "Rooms (guest counts)", "Check-in", "Check-out (exclusive)", "Nights", "Guests", "Pets", "Estimate (not payment)", "Currency", "Created", "Updated"],
        rows: bookings.map((b) => [b.id, sharedBookingName(b), b.status, b.source, b.scope, b.scope === "WHOLE_HOUSE" ? "Whole house" : b.roomAllocations.map((a) => `${a.room.name} (${a.guestCount})`).join(", "), date(b.startDate), date(b.endDate), b.nights, b.totalGuests, b.petCount, amount(b.totalAmount), b.currency, b.createdAt.toISOString(), b.updatedAt.toISOString()]) },
      { key: "expenses", title: "Reebok - Expenses", headers: ["Expense ID", "Title", "Category", "Supplier", "Invoice number", "Amount", "Currency", "Service date", "Due date", "Paid date (recorded)", "Created", "Updated"],
        rows: expenses.map((e) => [e.id, e.title, e.category, e.supplier ?? "", e.invoiceNumber ?? "", amount(e.amount), e.currency, date(e.serviceDate), date(e.dueDate), date(e.paidDate), e.createdAt.toISOString(), e.updatedAt.toISOString()]) },
      { key: "payments", title: "Reebok - Payments", headers: ["Payment ID", "Booking reference", "Payer (as recorded)", "Subscription member(s)", "Amount", "Currency", "Method", "Status", "Reference", "Paid date (recorded)", "Coverage start", "Coverage end", "Months covered", "Created"],
        rows: payments.map((p) => [p.id, p.bookingId ?? "", p.payer?.name ?? "", p.subscriptionLinks.map((s) => s.subscription.user.name).join(", "), amount(p.amount), p.currency, p.method, p.status, p.reference ?? "", date(p.paidAt), date(p.periodStart), date(p.periodEnd), p.monthsCovered ?? "", p.createdAt.toISOString()]) },
      { key: "member-fees", title: "Reebok - Member Fees", headers: ["Subscription ID", "Member ID", "Member", "Active account", "Monthly amount (ZAR)", "Recorded arrears (ZAR)", "Next due date", "Last payment date", "Updated"],
        rows: fees.map((s) => [s.id, s.userId, s.user.name, s.user.isActive, amount(s.monthlyAmount), amount(s.arrearsAmount), date(s.nextDueDate), date(s.lastPaymentDate), s.updatedAt.toISOString()]) },
      { key: "readme", title: "Reebok - Readme", headers: ["Topic", "Details"], rows: [
        ["Snapshot generated (UTC)", new Date().toISOString()], ["Direction", "Reebok app -> Google Sheets only. Edit source records in the app."],
        ["Sharing", "Anyone with workbook access can see ALL tabs, including financial data. Google sharing is separate from app roles."],
        ["Managed tabs", "Reebok report tabs are replaced on every successful sync. Keep manual calculations and notes in separate tabs."],
        ["Bookings", "All history, including pending, approved, rejected and cancelled stays. Pending and approved accommodation is held; checkout is exclusive."],
        ["Privacy", "Member lead names are included. Guest stays are anonymous. No contact details, management tokens, private notes, proof/document URLs or gateway payloads are exported."],
        ["Finance", "Booking estimates are not receipts. Payments retain their recorded status. Arrears are admin-recorded, not an automatic bank reconciliation."],
        ["Freshness", "Check last successful sync in the app. A Google outage does not prevent booking in the app. Scheduled sync requires an operator-configured job."],
        ["Restoration", "This reporting workbook is not a database backup and does not restore app records."]
      ] }
    ];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000, maxWait: 10000 });
}
