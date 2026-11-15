"""Generate the shareable role tutorials. Requires ReportLab and pypdf.

Review against src/lib/user-guide.ts, portal navigation, and the live release.
These documents contain no credentials or live personal booking information.
They are not copied into public/ or deployed automatically.
"""
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf"
REVIEWED = "14 November 2026"
SITE = "https://reebok.williamson.co.za"
WORKBOOK = "https://docs.google.com/spreadsheets/d/1-F5tjpaoJ-crDS6FDkPx2xXd3iZI-QFEF3deeB9CsnQ/edit"
W, H = 595.276, 841.89
MARGIN, WIDTH = 43, W - 86
TEAL, INK, MUTED = colors.HexColor("#185B58"), colors.HexColor("#233F40"), colors.HexColor("#566B69")
SAND, SEA, PAPER = colors.HexColor("#F3EADD"), colors.HexColor("#E6F0EA"), colors.HexColor("#FCFAF5")
LINE, CLAY = colors.HexColor("#D7DFD8"), colors.HexColor("#A35F44")
FONT_DIR = Path("/System/Library/Fonts/Supplemental")
FONT_FILES = {
    "TutorialHeading": "Georgia.ttf", "TutorialBody": "Trebuchet MS.ttf",
    "TutorialBold": "Trebuchet MS Bold.ttf", "TutorialItalic": "Trebuchet MS Italic.ttf",
    "TutorialBoldItalic": "Trebuchet MS Bold Italic.ttf",
}
if all((FONT_DIR / file).exists() for file in FONT_FILES.values()):
    for name, file in FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    pdfmetrics.registerFontFamily("TutorialBody", normal="TutorialBody", bold="TutorialBold",
                                  italic="TutorialItalic", boldItalic="TutorialBoldItalic")
    HEAD, BODY, BOLD = "TutorialHeading", "TutorialBody", "TutorialBold"
else:
    HEAD, BODY, BOLD = "Times-Roman", "Helvetica", "Helvetica-Bold"

STYLES = {
    "body": ParagraphStyle("body", fontName=BODY, fontSize=10.4, leading=14.6, textColor=INK),
    "small": ParagraphStyle("small", fontName=BODY, fontSize=9.2, leading=12.6, textColor=MUTED),
    "table": ParagraphStyle("table", fontName=BODY, fontSize=9.5, leading=13.1, textColor=INK),
    "th": ParagraphStyle("th", fontName=BOLD, fontSize=9.3, leading=12.4, textColor=colors.white),
    "subtitle": ParagraphStyle("subtitle", fontName=BODY, fontSize=10.7, leading=15, textColor=MUTED),
}


def link(label, path):
    url = path if path.startswith("https://") else SITE + path
    return f'<link href="{escape(url, {chr(34): "&quot;"})}" color="#185B58"><u>{escape(label)}</u></link>'


ROOMS = [
    ["Room 1", "Sea facing", "Queen", "2"],
    ["Room 2", "Sea facing", "Queen + pull-out single", "3"],
    ["Room 3", "Sea facing", "Queen + pull-out single", "3"],
    ["Room 4", "Not specified", "Queen + single + tri-bunk (single over double)", "6"],
    ["Room 5", "North facing", "Two three-quarter beds; extra pull-out not confirmed", "2"],
    ["Room 6", "North facing", "Queen", "2"],
    ["Room 7", "Sea facing; old flat", "Queen + bunk beds + pull-out single", "5"],
]


class Tutorial:
    def __init__(self, audience, total):
        self.audience, self.total, self.number = audience, total, 0
        self.path = OUT / f"reebok-{audience.lower()}-tutorial.pdf"
        self.c = canvas.Canvas(str(self.path), pagesize=(W, H), invariant=1)
        self.c.setTitle(f"Reebok House Manager | {audience} tutorial")
        self.c.setAuthor("Reebok House Manager")
        self.c.setSubject(f"Step-by-step {audience.lower()} guide, reviewed {REVIEWED}")
        self.c.setViewerPreference("DisplayDocTitle", "true")
        self.bottoms = []

    def page(self, title, subtitle):
        if self.number:
            self.finish_page()
        self.number += 1
        c = self.c
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(TEAL if self.audience == "Admin" else CLAY)
        c.rect(0, H - 7, W, 7, fill=1, stroke=0)
        c.setFont(BOLD, 8.7)
        c.setFillColor(TEAL)
        c.drawString(MARGIN, H - 32, f"REEBOK HOUSE  /  {self.audience.upper()} TUTORIAL")
        c.setFont(BODY, 8.3)
        c.setFillColor(MUTED)
        c.drawRightString(W - MARGIN, H - 32, "NOVEMBER 2026")
        c.setFillColor(INK)
        c.setFont(HEAD, 25)
        c.drawString(MARGIN, H - 70, title)
        self.y = H - 84
        self.p(subtitle, "subtitle", gap=17)
        c.bookmarkPage(f"page-{self.number}")
        c.addOutlineEntry(title, f"page-{self.number}", 0)

    def p(self, text, style="body", gap=8):
        para = Paragraph(text, STYLES[style])
        _, height = para.wrap(WIDTH, H)
        para.drawOn(self.c, MARGIN, self.y - height)
        self.y -= height + gap

    def section(self, title):
        self.y -= 8
        self.c.setFillColor(TEAL)
        self.c.setFont(BOLD, 12.4)
        self.c.drawString(MARGIN, self.y - 12, title)
        self.y -= 24

    def step(self, number, title, text):
        para = Paragraph(f"<b>{escape(title)}</b><br/>{text}", STYLES["body"])
        _, height = para.wrap(WIDTH - 32, H)
        self.c.setFillColor(SEA)
        self.c.circle(MARGIN + 10, self.y - 9, 10, fill=1, stroke=0)
        self.c.setFillColor(TEAL)
        self.c.setFont(BOLD, 9)
        self.c.drawCentredString(MARGIN + 10, self.y - 12, str(number))
        para.drawOn(self.c, MARGIN + 32, self.y - height)
        self.y -= height + 10

    def note(self, title, text, caution=False):
        para = Paragraph(f"<b>{escape(title)}</b><br/>{text}", STYLES["body"])
        _, height = para.wrap(WIDTH - 26, H)
        height += 24
        self.c.setFillColor(SAND if caution else SEA)
        self.c.roundRect(MARGIN, self.y - height, WIDTH, height, 7, fill=1, stroke=0)
        para.drawOn(self.c, MARGIN + 13, self.y - height + 12)
        self.y -= height + 12

    def table(self, headers, rows, fractions):
        data = [[Paragraph(str(cell), STYLES["th"]) for cell in headers]]
        data += [[Paragraph(str(cell), STYLES["table"]) for cell in row] for row in rows]
        table = Table(data, colWidths=[WIDTH * fraction for fraction in fractions])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F4EF")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, LINE),
        ]))
        _, height = table.wrap(WIDTH, H)
        table.drawOn(self.c, MARGIN, self.y - height)
        self.y -= height + 12

    def finish_page(self):
        assert self.y >= 54, f"{self.audience} page {self.number} overflows: bottom={self.y:.1f}"
        self.bottoms.append(round(self.y, 1))
        c = self.c
        c.setStrokeColor(LINE)
        c.line(MARGIN, 42, W - MARGIN, 42)
        c.setFont(BODY, 8)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, 27, "reebok.williamson.co.za")
        c.linkURL(SITE, (MARGIN, 23, MARGIN + 110, 36), relative=0)
        c.drawCentredString(W / 2, 27, f"Reviewed {REVIEWED}")
        c.drawRightString(W - MARGIN, 27, f"{self.number} / {self.total}")
        c.showPage()

    def save(self):
        self.finish_page()
        assert self.number == self.total
        self.c.save()
        reader = PdfReader(self.path)
        assert len(reader.pages) == self.total
        text = "\n".join(page.extract_text() for page in reader.pages)
        assert all(len(page.extract_text()) > 500 for page in reader.pages)
        assert "PRIVATE KEY" not in text and "admin1234" not in text and "member1234" not in text
        links = sum(len(page.get("/Annots", [])) for page in reader.pages)
        assert links >= self.total + 3
        print(f"Created {self.path.name}: {self.total} pages; {links} links; page bottoms {self.bottoms}")


def member_tutorial():
    g = Tutorial("Member", 5)
    g.page("Your family's guide to Reebok", "Plan a stay, see who is visiting, and help care for the house.")
    g.note("The three rules to remember", "Book only the rooms you need. A Pending request holds accommodation, but is not yet approved. An approved booking is not a payment receipt.")
    g.section("Start here")
    g.step(1, "Sign in to the family website", f"Open {link('reebok.williamson.co.za', '/')} and choose <b>Sign In</b>. If you registered from an invitation, an admin must approve your registration before you have member access.")
    g.step(2, "Open Family home", f"Go to {link('Family home', '/member')}. On a phone, open <b>Menu</b> to switch portals and <b>Family menu &gt; Browse</b> to see the member pages.")
    g.step(3, "Plan, request, then check the result", "Use <b>Who's staying</b> to plan, <b>Book a stay</b> to request accommodation, and <b>My bookings</b> to check approval and manage your own stays.")
    g.section("Find your way around")
    g.table(["In the Family menu", "What you can do", "Guide"], [
        ["Book a stay", "Request rooms or the whole house", "Page 2"],
        ["Who's staying", "See the room planner, month or agenda", "Page 3"],
        ["My bookings / My fees", "Manage your stays; view recorded fee status", "Page 4"],
        ["Maintenance &amp; assets / Family decisions", "Report faults, propose decisions and vote", "Page 5"],
        ["Useful info &amp; feedback", "Read house notices and leave stay feedback", "Page 5"],
    ], [.32, .54, .14])
    g.p("<b>Who is this for?</b> Members and shareholders. Shareholders also have read-only <b>Financial records</b> and exports; that does not make them admins. Guests have their own <b>My stay</b> area and can book only the whole house.")
    g.p("Need an account, a password change or help with your role? Contact a house admin. There is no self-service password-reset screen.", "small")

    g.page("Request a family stay", "Family menu > Book a stay | Members can reserve one room, several rooms or the whole house.")
    g.step(1, "Choose the kind of stay", f"Open {link('Book a stay', '/member/book')}. Select <b>Shared family stay</b> to reserve only your rooms. Choose <b>Whole house</b> only for exclusive use; every room must be free.")
    g.step(2, "Choose check-in, then check-out", "Select arrival, then departure at least one day later. Member/family bookings allow <b>1-10 nights per booking</b> within the published horizon. This is not a combined allowance across separate bookings.")
    g.step(3, "Count every person once", "Include yourself under <b>Who is staying?</b> Use the appropriate categories below. Ask an admin if you are unsure which category applies; do not count one person twice.")
    g.table(["The six member pricing categories"], [
        ["Members / Dependents with a member / Dependents without a member"],
        ["Guests of a member / Guests of a dependent / Other family (mere family)"],
    ], [1])
    g.step(4, "Allocate your rooms", "For a shared stay, select rooms available for <b>all</b> your nights. Enter the guest count in each room; the total must match your party and stay within each room's capacity. A family/group label is optional.")
    g.step(5, "Add your contact details and pets", "Check the lead name, enter a contact phone, declare the number of pets and add useful notes. Updates go to your account email. When bringing pets, read the notice displayed by the app.")
    g.step(6, "Review the estimate and submit once", "Check dates, rooms, party counts and total. Select <b>Request member booking</b>. Keep the reference from <b>Request received</b>, then check <b>My bookings</b> for approval.")
    g.note("Member pricing", "Published guest-category prices apply per person per night, including member whole-house stays. There is no separate member whole-house surcharge. Rates can change; rely on the current estimate, not a price copied into this guide.")
    g.p("<b>Request button unavailable?</b> Check both dates, guest counts, available rooms and that every guest is allocated within capacity. Wait for the estimate, or use <b>Refresh estimate</b>. If rates or rooms are not configured, contact an admin.")
    g.p("<b>Pet rule:</b> the default notice says the property is pet friendly, but furniture and bedrooms are not. Follow the current notice if the house team updates it.", "small")

    g.page("Choose rooms, read the calendar", "Family menu > Who's staying | The confirmed seven-room capacity is 23 guests.")
    g.table(["Room", "Position", "Beds", "Sleeps"], ROOMS, [.14, .21, .52, .13])
    g.p("Room 5 stays capped at two until its possible extra bed is confirmed. The live room inventory controls what can be booked; ask an admin about any change.", "small")
    g.section("How to read Who's staying")
    g.p("Open " + link("Who's staying", "/member/calendar") + ". Choose <b>Room planner</b> for two weeks by room, <b>Month</b> for an overview, or <b>Agenda</b> for a list. Agenda opens first on smaller screens. Use Today, Previous, Next, Jump to date and the filters; on phones expand <b>Filters &amp; calendar help</b>.")
    g.p("<b>Pending:</b> striped and labelled; it holds the selected accommodation. <b>Approved:</b> solid green; it also holds accommodation. A whole-house stay occupies every room. Rejected or cancelled bookings do not block dates.")
    g.note("Example: two families, the same dates", "A party of four can request Room 1 for two people and Room 2 for two people. Another family can make a separate booking for other available rooms on those dates. Do not choose Whole house if the remaining rooms should stay available.")
    g.p("<b>Checkout is not an occupied night.</b> A booking from 27 to 31 December is four nights. Another stay can start on 31 December. A pending hold does not automatically expire; ask an admin about an abandoned request.")
    g.p("Members see lead member/account names and accommodation summaries, not other families' prices, contacts or private notes. External guest stays are anonymous. Refresh the calendar for recent changes; the server checks availability again when you submit.", "small")

    g.page("Your bookings and member fees", "Keep the booking status, the accommodation estimate and member contributions separate.")
    g.section("Find or change your own booking")
    g.step(1, "Open My bookings", f"Use {link('My bookings', '/member/bookings')} or a <b>Manage stay</b> link on Family home. <b>Current &amp; upcoming</b> shows active stays; <b>Booking history</b> includes rejected and cancelled requests, even when their dates are still ahead.")
    g.step(2, "Review the record before editing", "Open the management page and check dates, guests, pets, notes and contact details. You cannot use someone else's reference to access their booking.")
    g.step(3, "Save only when ready for review again", "Every saved edit resets the booking to <b>Pending</b>. Date changes can reprice it; note-only edits preserve the amount. Existing stays over 10 nights remain recorded but must be shortened before saving or a new approval. Ask an admin about rooms, guest categories or party-size changes; a replacement request may be needed.")
    g.note("Need to cancel? Contact an admin", "There is no self-service cancellation button. Ask an admin to reject/release your booking, then check the status. Adding a cancellation request in Notes does not cancel the booking.", caution=True)
    g.section("Missing booking or missing email?")
    g.p(f"Use {link('Manage by Reference', '/booking/manage')} with the reference and matching email to request a private management link. For an unsigned-in visitor, knowing the reference and email is not enough to view or edit the booking. Keep the emailed link private.")
    g.p("If a submission's response or email is missing, check My bookings and contact an admin before trying again. Check your address and spam folder. Email delivery depends on the mail service; the saved app record is the reliable status check.")
    g.section("Check My fees")
    g.p(f"Open {link('My fees', '/member/fees')} to review your recorded monthly amount, arrears, last payment and next due date. Select reminder frequency and click <b>Save Reminder Preferences</b>. Actual delivery also requires the server's reminder job and email setup.")
    g.p("If a payment is missing or a balance looks wrong, give the admin the payment date, amount and reference privately. A zero display or missing subscription is not proof that nothing is owed. Members do not edit their own balances.")
    g.p("<b>Important:</b> accommodation charges and monthly member fees are different records. The app is not online checkout or a live bank feed. Confirm payment arrangements with the house team.", "small")

    g.page("Take part and care for the house", "Property faults, family decisions and stay feedback each have their own place.")
    g.section("Report a fault or maintenance request")
    g.p(f"Open {link('Maintenance & assets', '/member/maintenance')} and use <b>Report Maintenance Task</b>. Add a clear title and description, choose an asset or General task, set priority and add a due date, cost estimate or supporting file if useful. Submit and follow <b>My Maintenance Tasks</b>.")
    g.p("An admin must approve the work; approval is not completion. You can also consult the asset registry. For urgent safety problems, contact the house team directly rather than waiting for a task response.")
    g.section("Propose a decision or vote")
    g.p(f"Open {link('Family decisions', '/member/decisions')}. Submit a clear proposal for admin review. It is not a live poll until an admin launches it. For an eligible open poll, choose <b>Yes</b>, <b>No</b> or <b>Abstain</b> and check the counts and participation display.")
    g.p("You can change your choice while voting is open; it replaces your earlier choice. Director-only polls are not visible to members. The tool does not apply quorum, share weighting or binding-outcome rules.")
    g.section("Before arrival and after your stay")
    g.p(f"Open {link('Useful info & feedback', '/guest')} for the admin-maintained notice board and important numbers. Expand <b>Tell us about your stay</b> to leave a rating and message, optionally linked to your booking. Member/guest submissions await moderation before public display.")
    g.note("Keep family information safe", "Uploaded documents are accessible to anyone with their file URL. Do not upload passwords, identity documents or unredacted financial details. Keep booking-management and Telegram-linking links out of family group chats.", caution=True)
    g.section("Optional connections and practical limits")
    g.p("<b>Telegram, when the bot is configured:</b> open <b>Connect Telegram</b>, generate your personal link and press Start within ten minutes. Use /availability in private chat. It checks availability only; booking, editing and approval still happen on the website. WhatsApp is not implemented.")
    g.p("<b>Google Sheets:</b> reporting is live, but workbook access is separately controlled by its owner. It contains financial information, so ordinary member access to the app does not imply access to the workbook. Sheet edits do not update the app.")
    g.p("<b>Need help?</b> Contact an admin with the page name, time, booking reference if relevant, and what happened. Never send a password or private link. Admins have a separate App feedback area for software suggestions.", "small")
    g.save()


def admin_tutorial():
    g = Tutorial("Admin", 7)
    g.page("The Reebok house desk", "A practical operating guide for appointed administrators. Share this version with the admin team.")
    g.note("Three different decisions", "Booking approval confirms accommodation, not payment. Maintenance approval authorises a workflow, not proof of completed work. Poll totals show votes, not an automatically binding decision.")
    g.section("Your first five minutes")
    g.step(1, "Sign in and open Overview", f"Use {link('the house website', '/')} and {link('Admin Overview', '/admin')}. Review <b>Bookings needing approval</b> and <b>Active &amp; upcoming stays</b>. On phones, open <b>Admin menu &gt; Browse</b> to navigate.")
    g.step(2, "Review requests before making changes", "Use <b>Approvals &amp; history</b> or <b>Booking calendar</b>. Check dates, room use and party details. Do not reject a genuine booking just to make the calendar look free.")
    g.step(3, "Check operations and records", "Review pending maintenance, invitation registrations and decisions. Check the finance records against bank evidence, and Google Sheets for a recent verified success.")
    g.section("Tutorial map")
    g.table(["Admin menu area", "Use it for", "Page"], [
        ["Booking calendar / Approvals &amp; history", "Approve, comment, reject, reschedule and audit", "2"],
        ["Pricing &amp; Rooms", "Publish tariffs and maintain room capacity", "3"],
        ["Finances", "Member fees, payments and expenses", "4"],
        ["Google Sheets", "Monitor the shared reporting copy", "5"],
        ["User administration / Decisions / Guest feedback / Email templates", "Accounts, invitations, voting and feedback", "6"],
        ["Asset management / Maintenance / App feedback", "House upkeep and private tool feedback", "7"],
    ], [.43, .47, .10])
    g.p("<b>Access is by appointment.</b> Admins manage house operations. A shareholder has member access and full read-only finances, not admin authority. Only a super-admin may create or manage super-admin accounts.")
    g.p("This guide reflects the November 2026 release. Google Sheets was enabled and verified on 14 November. Email, reminders and Telegram still depend on their own operational setup; their menu entries alone do not prove live delivery.", "small")

    g.page("Bookings: review, decide, record", "Keep requests, confirmed stays and payment records distinct. Pending requests already hold accommodation.")
    g.step(1, "Review the request", f"Open {link('Approvals & history', '/admin/bookings')}; Pending Approvals are at the top. Or select a stay in {link('Booking calendar', '/admin/calendar')}. Check dates, rooms, guest categories, pets, notes and the estimate.")
    g.step(2, "Approve, clarify or reject", "Use <b>Approve</b> when the request is acceptable; availability is checked again. Add a comment for clarifications and offline decisions. For rejection, enter a clear reason, then <b>Reject</b>. The accommodation is released and the booking moves to history.")
    g.step(3, "Check the result and audit trail", "Expand the entry in <b>History &amp; Audit Trail</b> for its creation, approvals, comments and rejection reasons. In the calendar, <b>All statuses</b> includes rejected/cancelled history. Do not rely only on an email being sent.")
    g.p("<b>Stay limits:</b> member/family bookings, including admins at member rates, are capped at <b>10 nights per booking</b>; guest bookings retain 90 nights. No admin override exists. Existing longer records remain intact; shorten member stays before edits, approval or conversion to member rates.", "small")
    g.section("Change dates, or release unused rooms")
    g.p("<b>Reschedule:</b> in the booking detail, expand <b>Change dates</b>. Agree the dates with the family, choose check-in/out, review the new estimate and enter a reason/agreement. Save, then approve again if appropriate. Rooms and guest categories stay unchanged.")
    g.p("<b>Correct accommodation:</b> expand <b>Correct member accommodation / release unused rooms</b>. Agree which rooms are needed, select rooms or Whole house, check category counts and the revised estimate, and record a reason. The correction keeps dates and party size, reprices the stay and returns it to Pending.")
    g.note("Tell the family directly", "Admin date and accommodation corrections do not send a correction email themselves. Notify the family, then review the new Pending record. Nothing automatically converts an old whole-house booking to rooms. Public bookings are eligible for member correction only when owned by an active member account.", caution=True)
    g.section("Calendar rules worth checking")
    g.p("Use Room planner, Month or Agenda, date navigation and filters. Pending is striped; Approved is solid green. Both block their rooms. Whole-house bookings block every room; different room bookings may overlap. Checkout is exclusive, and pending requests do not auto-expire. Refresh if another admin changed a record; there is no drag-and-drop rescheduling.")
    g.p("<b>Withdrawals:</b> members must ask an admin to reject/release a stay; there is no self-service cancel button. Saving a member edit, even a note-only edit, also resets approval. Review the current record rather than its old confirmation.", "small")

    g.page("Publish pricing, protect capacity", "Admin menu > Pricing & Rooms | Accommodation tariffs are separate from monthly member contributions.")
    g.step(1, "Review the applicable prices", f"Open {link('Pricing & Rooms', '/admin/pricing')}. Review all six member categories: Members; Dependents with/without a member; Guests of a member/dependent; Other family. Prices apply per person per night, including member whole-house stays, without a separate whole-house surcharge.")
    g.step(2, "Set guest tariffs and publish a dated version", "For external guests, review adult and child-under-six rates, currency and any whole-house minimum. The minimum is for the <b>entire stay</b>. External seasonal rates apply night by night; higher priority wins overlaps. Seasons do not change member rates.")
    g.p("Choose an effective check-in date and publish only agreed prices. The latest applicable tariff at check-in governs the stay. <b>Pricing versions</b> shows older values and can load a new draft. If another admin publishes first, reload before retrying.")
    g.note("Publishing does not rewrite saved bookings", "Existing estimates and individual subscriptions are not automatically updated. Date edits and accommodation corrections may reprice a booking. No new request can be priced without an applicable published tariff.")
    g.section("Room inventory reference")
    g.table(["Room", "Position", "Beds", "Sleeps"], ROOMS, [.14, .21, .52, .13])
    g.p("<b>Total confirmed capacity: 23.</b> Room 5 remains capped at two. Review existing room records instead of installing duplicates. The seven-room installer is only for an empty inventory. Do not reduce capacity, disable or rename a room without checking active allocations and physical room identity.", "small")

    g.page("Keep clear financial records", "Admin menu > Finances | These are operational records, not bank reconciliation or online checkout.")
    g.section("Member fees and payments")
    g.step(1, "Review the member subscription", f"Open {link('Finances > Member fees', '/admin/finances/fees')}. Select the member, then check the monthly amount, recorded arrears, next due date and reminder settings. Save only agreed adjustments.")
    g.step(2, "Record a payment once", "Use <b>Record Member Fee Payment</b>. Enter amount, method, status, months covered, coverage start and reference. Confirm the real bank receipt before using a confirmed status. Check the correct member and coverage; do not duplicate a payment already recorded.")
    g.step(3, "Reconcile and communicate", "Review the resulting fee status against bank evidence. Arrears are recorded figures, not a live bank calculation. Members see their own status; shareholders can view/export wider records but cannot edit or import. Reminder preferences need both working email and the scheduled reminder job.")
    g.section("Capture and review house expenses")
    g.p(f"Open {link('Finances > Expenses ledger', '/admin/finances/expenses')}. Enter the title, category, supplier, amount, currency and relevant service/due/paid dates. Add the invoice reference and a safe supporting document if needed, then <b>Save Expense</b>. Check <b>Ledger Entries</b> for the result.")
    g.note("Import carefully: selecting the file starts it", "Export a copy first using <b>Export CSV</b> or <b>Export XLSX</b>. Prepare and inspect the import file, then choose it in <b>Import CSV/XLSX</b>. Imports create entries; they are not an update-by-ID workflow. Re-imports can create duplicates. If a run fails, inspect the ledger before retrying because some rows may already have been created.", caution=True)
    g.p("For a new expense import, use the field names from an exported ledger. Recognised fields include <b>title, category, description, supplier, invoiceNumber, amount, currency, serviceDate, dueDate, paidDate</b>. Use plain numeric amounts and unambiguous YYYY-MM-DD dates; verify totals and dates after import.")
    g.section("Money and document safety")
    g.p("Keep accommodation pricing separate from monthly contributions. A booking estimate is not income received, and approval is not a receipt. Payment-method labels do not prove a live payment gateway. Changing a subscription default does not update all individual subscriptions.")
    g.p("Uploads are accessible to anyone with the file URL. Redact confidential details before attaching invoices or warranty documents. Never upload passwords, private keys, identity documents or unredacted bank statements.", "small")

    g.page("Use the shared reporting workbook", "Admin menu > Google Sheets | Live and verified on 14 November 2026; scheduled every five minutes.")
    g.note("The app is the source of truth", "This is a one-way app-to-Google reporting copy. Make booking and finance changes in the app. Editing a managed Google tab does not update the app and your edits will be replaced on the next successful sync.")
    g.step(1, "Check the connection", f"Open {link('Google Sheets settings', '/admin/integrations')}. Confirm <b>Enabled</b>, the correct workbook, <b>Last verified success</b> and <b>Last scheduler check-in</b>. The existing service account and scheduled task are already configured; no Gmail password is needed.")
    g.step(2, "Refresh and inspect", "Use <b>Sync now</b> for an immediate refresh and <b>Refresh status</b> for the result. Check the success message and row counts, then <b>Open workbook</b>. Do not treat a scheduler check-in alone as proof of a successful export.")
    g.table(["Managed tab", "What to expect"], [
        ["Reebok - Bookings", "All booking history, including rejected/cancelled stays; member lead names, accommodation and estimates."],
        ["Reebok - Expenses", "Recorded ledger entries, suppliers, amounts and dates."],
        ["Reebok - Payments", "Recorded payments, statuses, references and coverage."],
        ["Reebok - Member Fees", "Subscriptions, recorded arrears and due/payment dates."],
        ["Reebok - Readme", "Snapshot time, definitions, privacy and maintenance notes."],
    ], [.31, .69])
    g.p("At first verification there were three bookings and no expenses, payments or subscriptions. Headers-only finance tabs were therefore correct, not a failed sync. Later counts should match the records then held in the app.", "small")
    g.section("Sharing and recovery")
    g.p("The workbook owner controls access in Google Drive. <b>Everyone with workbook access can see all financial tabs.</b> App roles do not carry across; hiding a tab is not privacy protection. Keep manual notes/formulas in separate tabs. Unrelated tabs are left alone.")
    g.p("If a run fails, check the displayed error and last success. Later runs retry with increasing delays, up to an hour. Ask the operator about credentials, Editor sharing, API access or a stale scheduler. Booking in the app continues during a Google outage. This workbook is not a database backup.")
    g.p(link("Open the family reporting workbook (authorised viewers only)", WORKBOOK), "small")

    g.page("Accounts, decisions and messages", "Use the right audience and preserve a clear record of each decision.")
    g.section("Create accounts or invite self-registration")
    g.p(f"In {link('User administration', '/admin/users')}, create an account with name, email, intended role, active status and a strong temporary password. Share credentials privately. Password changes need admin assistance; do not reuse demo passwords.")
    g.p("Alternatively use <b>Send Registration Invite</b>, choose the email, role and expiry, and send it. After the recipient registers, review <b>Invite Registrations Awaiting Approval</b> and approve or reject with a reason. An invitation alone does not activate membership. Review Invitation History if there is a problem.")
    g.note("Roles are not interchangeable", "Use Member for normal family access; Shareholder adds read-only finances. Admin is an explicit appointment. Only a super-admin may manage super-admin accounts. Keep another working super-admin available before changing your own access.")
    g.section("Review a proposal and launch a poll")
    g.p(f"Open {link('Decisions', '/admin/decisions')}. Create a decision or review a member proposal. Choose <b>Admins Only</b> for director-sensitive matters or <b>Members and Admins</b> for the wider group. Set a closing time if appropriate, then launch the poll.")
    g.p("Eligible active users choose Yes, No or Abstain and may replace their vote while open. Review counts and participation; <b>Close Poll</b> when finished and communicate the outcome separately. The app does not apply legal quorum, share weighting or tie-breaking rules, and eligibility is not a frozen voting roll.")
    g.section("Moderate stay feedback and keep notices useful")
    g.p(f"Open {link('Guest feedback', '/admin/feedback')} to review submissions, choose public/internal visibility and publish or unpublish. Check personal information before publication. This is separate from the private admin App feedback board.")
    g.p("From <b>Approvals &amp; history &gt; House notices &amp; booking settings</b>, maintain the pet notice and My stay Useful Info title/body. Each non-empty line becomes a notice-board item. Use verified contacts, not sample numbers; never put credentials on this board.")
    g.section("Edit booking email templates")
    g.p(f"In {link('Email templates', '/admin/templates')}, choose the request receipt, admin approval request, approval or rejection template. Edit subject/body, preserve needed placeholders and save. Private management links must stay private.")
    g.p("Email setup and delivery need a separate check. A saved template is not a delivery test; check the address/spam folder and ask the operator about SMTP. Invitations and subscription reminders are not all controlled by this booking-template editor.", "small")
    g.p("<b>Telegram, when configured:</b> admins can approve a family group in <b>Telegram</b> using its group ID. Group commands hand users off to private chat; group membership does not grant app access. Members/admins must link their active account for protected availability.", "small")

    g.page("Care for the house and the tool", "Approved work still needs completion. Report software problems separately from property maintenance.")
    g.section("Maintenance: request to completion")
    g.step(1, "Review Pending Approval", f"Open {link('Maintenance', '/admin/maintenance')}. Check the task description, asset, priority, estimated cost, due date and documents. Assign as appropriate and approve, or reject with a reason. You can also log a task here.")
    g.step(2, "Follow In Progress", "Track authorised work and keep supporting evidence attached. Once work has been checked, enter the actual cost/document and mark complete. Use <b>Completed / Rejected Tasks</b> for earlier records.")
    g.step(3, "Maintain the asset register", f"Open {link('Asset management', '/admin/assets')}. Add assets and review status, location, purchase/warranty details and linked documentation. Use <b>Upload Warranty Document</b> for appropriate evidence and save changes. Members can consult the registry.")
    g.section("Private feedback about the software")
    g.p(f"Use {link('App feedback', '/admin/app-feedback')} for a problem, suggestion or comment. Include the page, steps, expected result and actual result, without passwords or private links. Current and future appointed admins can read the discussions; members and shareholders cannot.")
    g.p("Reply to preserve context and set New, Under Review, Planned or Resolved. Status changes are recorded. Posts/replies are retained without edit/delete controls; add corrections as replies. There are no assignments, attachments, email alerts or promised delivery dates in this feature.")
    g.section("A simple operating routine")
    g.table(["When", "Check"], [
        ["Before arrivals", "Approve or clarify requests; check rooms, pets and notices; agree any date/allocation correction with the family."],
        ["Regularly", "Review invitations, pending work, polls and guest feedback; reconcile payments and expenses; check Sheets freshness."],
        ["When access changes", "Review app role/active status and Google Drive sharing separately. Remove obsolete access through the relevant controls."],
    ], [.22, .78])
    g.section("What is not automated")
    g.p("No self-service booking cancellation or password reset; no verified online checkout or bank reconciliation; no formal vote outcome rules. Telegram is read-only availability when configured, not booking. WhatsApp and automatic Airbnb/Booking.com reservation sync are not implemented. Uploads are not private storage.", "small")
    g.p("Use <b>User guide</b> in the admin menu for the embedded reference. For an operational fault, contact the operator with the page, time and safe error details. Do not copy production data or reset the database as a troubleshooting shortcut.", "small")
    g.save()


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    member_tutorial()
    admin_tutorial()
