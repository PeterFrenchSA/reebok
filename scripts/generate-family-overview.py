"""Generate the shareable, one-page family overview. Requires reportlab and pypdf."""
from pathlib import Path
from shutil import copyfile
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/reebok-family-overview.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
FONT = Path("/System/Library/Fonts/Supplemental/Georgia.ttf")
if FONT.exists():
    pdfmetrics.registerFont(TTFont("GuideTitle", str(FONT)))
TITLE_FONT = "GuideTitle" if FONT.exists() else "Times-Roman"
W, H = 595.276, 841.89
GREEN, TEXT, MUTED = "#135742", "#26342D", "#58635A"
c = canvas.Canvas(str(OUTPUT), pagesize=(W, H), invariant=1)
c.setTitle("Reebok House Manager | Family overview")
c.setAuthor("Reebok House Manager")
c.setSubject("Capabilities, booking rules, limitations and family FAQ")
body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.2, leading=12.2, textColor=HexColor(TEXT))
small = ParagraphStyle("small", parent=body, fontSize=8.3, leading=10.8, textColor=HexColor(MUTED))
white = ParagraphStyle("white", parent=body, fontSize=10, leading=14, textColor=HexColor("#E5F1E8"))


def para(text, x, y, width, style=body, gap=7):
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, y - height)
    return y - height - gap


def label(number, text, x, y):
    c.setFillColor(HexColor(GREEN))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x, y, f"{number}  {text}")
    return y - 14


c.setFillColor(HexColor("#FAF8F2"))
c.rect(0, 0, W, H, fill=1, stroke=0)
c.setFillColor(HexColor(GREEN))
c.rect(0, H - 142, W, 142, fill=1, stroke=0)
c.setFillColor(HexColor("#CEE5D3"))
c.setFont("Helvetica-Bold", 9)
c.drawString(35, H - 31, "FAMILY QUICK GUIDE  /  OCTOBER 2026")
c.setFillColor(HexColor("#FFFFFF"))
c.setFont(TITLE_FONT, 28)
c.drawString(35, H - 70, "Reebok House Manager")
para("A shared record for stays, house upkeep, member fees and family decisions. "
     "It supports the house team; it does not replace approval, payment checks or personal contact.",
     35, H - 86, W - 70, white)

c.setFillColor(HexColor("#E7EEE3"))
c.roundRect(35, 651, W - 70, 34, 5, fill=1, stroke=0)
para("<b>The key rule:</b> a request holds its dates, but only an admin's approval confirms the stay.", 46, 675, W - 92, gap=0)

left, right, width = 35, 311, 249
y = label("01", "WHO CAN DO WHAT?", left, 629)
for text in [
    "<b>Guests:</b> their own bookings, stay feedback and the Useful Info notice board.",
    "<b>Members:</b> shared booking summaries, own fee status, maintenance reports and eligible polls.",
    "<b>Shareholders:</b> member access plus full read-only finances and exports. Shareholding is not admin authority.",
    "<b>Appointed admins:</b> approvals, accounts, finances and house operations. Only a super-admin manages super-admin accounts."
]:
    y = para(text, left, y, width)
y = label("02", "HOW BOOKINGS WORK", left, y - 11)
for text in [
    "<b>Choose dates, guests and pets.</b> Select check-in, then a later check-out. Keep the reference after submitting.",
    "<b>Pending and approved both block accommodation.</b> A whole-house stay blocks every room; separate room stays can overlap only in different rooms. Checkout day can be the next check-in day.",
    "<b>Current form limit:</b> the website submits public-rate, whole-house requests, even from the member console. Room/member-rate arrangements need admin assistance; backend support is not a complete member booking form.",
    "<b>Edits need review again.</b> Saving changes returns the booking to Pending. Rejection releases dates; admins retain the history and reasons.",
    "<b>Pets:</b> declare the number and read the notice. Default: pet-friendly property, but not furniture or bedrooms."
]:
    y = para(text, left, y, width)
left_bottom = y

y = label("03", "WHAT THE APP HELPS WITH", right, 629)
for text in [
    "<b>House operations:</b> booking approvals/comments, expandable history, member invitations and registration review.",
    "<b>Money records:</b> member fees, recorded payments, expenses and CSV/XLSX ledger tools. Admins still reconcile against actual bank records.",
    "<b>Upkeep:</b> asset/warranty records and maintenance tasks, with approval, completion and supporting documents.",
    "<b>Decisions:</b> members propose; admins review and poll admins only or members plus admins. Yes/No/Abstain counts and participation are visible to the eligible audience.",
    "<b>Communication:</b> guest feedback moderation, Useful Info and editable booking email templates. This release also adds an admin-only User Guide and private App Feedback discussions."
]:
    y = para(text, right, y, width)
y = label("04", "LIMITS TO KEEP IN MIND", right, y - 11)
for text in [
    "<b>Setup-dependent:</b> booking emails need working email configuration. Fee reminders also need a scheduled job. A saved booking is not proof an email arrived.",
    "<b>Telegram:</b> linked members/admins can check availability when the bot is configured. No bot booking, WhatsApp or AI conversation; no working automatic Airbnb/Booking.com sync.",
    "<b>Not a full accounting or governance system:</b> no verified online checkout, automatic bank reconciliation or formal quorum/outcome rules.",
    "<b>Uploads are not private storage.</b> Anyone with a file URL can read it. Avoid sensitive documents; keep passwords and private booking links out of shared discussions."
]:
    y = para(text, right, y, width)
right_bottom = y
assert min(left_bottom, right_bottom) >= 180, (left_bottom, right_bottom)

c.setStrokeColor(HexColor("#C9D4C5"))
c.line(35, 176, W - 35, 176)
label("05", "QUICK ANSWERS", 35, 157)
questions = [
    ("Why are unapproved dates blocked?", "Pending requests hold dates until an admin approves or rejects them; there is no automatic expiry."),
    ("How do I find or change my booking?", "Use your signed-in booking list or request a private email link with the reference and matching email. A reference alone is not access."),
    ("How do I cancel or report a problem?", "Ask an admin to withdraw/reject a booking; there is no self-service cancel button. Use Maintenance for house faults, not software feedback."),
    ("What if I have no email or access?", "Check spam and contact an admin using verified Useful Info. Do not make a duplicate booking. Admins use App Feedback for software suggestions.")
]
y_left = y_right = 137
for index, (question, answer) in enumerate(questions):
    x, top = (left, y_left) if index < 2 else (right, y_right)
    bottom = para(f"<b>{question}</b><br/>{answer}", x, top, width, small, gap=8)
    if index < 2:
        y_left = bottom
    else:
        y_right = bottom
assert min(y_left, y_right) >= 30, (y_left, y_right)
c.setFont("Helvetica", 7.5)
c.setFillColor(HexColor(MUTED))
c.drawString(35, 17, "Reviewed 26 Oct 2026 | Live features depend on rollout and configuration. Ask an admin for the current website link.")
c.showPage()
c.save()
assert len(PdfReader(OUTPUT).pages) == 1
public = ROOT / "public/docs/reebok-family-overview.pdf"
public.parent.mkdir(parents=True, exist_ok=True)
copyfile(OUTPUT, public)
print(f"Created one-page PDF: {OUTPUT}")
