export type GuideSection = { id: string; title: string; audience: string; intro: string; steps: string[]; caution?: string };
export const guideReviewDate = "26 October 2026";
export const guideSections: GuideSection[] = [
  {
    id: "access", title: "Start here: accounts and roles", audience: "Everyone",
    intro: "One house, several kinds of access. Your role determines what you can see and do; being a shareholder does not make you an administrator.",
    steps: [
      "Use the house website link supplied by your administrator and sign in. Coolify is the hosting control panel, not the family login page.",
      "Guests use the Guest Booking Portal for their own accommodation, guest feedback and Useful Info. Members and admins may also use this portal for their own stays.",
      "Family members use the Member Console for shared booking summaries, their own bookings and fee status, maintenance reporting and eligible decisions. Shared summaries are not access to another person's private booking record.",
      "Shareholders have member access plus Financial Records with full read-only finances and exports. They cannot edit finances, approve bookings or use the admin portal unless appointed to an admin role.",
      "Appointed admins handle approvals, accounts and house operations. Only a super-admin may create or manage another super-admin. Ask an administrator for account or password help; there is no self-service password-reset screen."
    ],
    caution: "Keep passwords and emailed booking-management links private. Do not forward private links to the family group."
  },
  {
    id: "request", title: "Request accommodation", audience: "Guests, members and admins",
    intro: "A request is not a confirmed booking. Save the reference shown after submission and check the booking status rather than relying only on an email.",
    steps: [
      "Open the landing page or select Create New Booking. Choose check-in first; the calendar then moves to check-out, at least one day later.",
      "Enter the lead guest's name, email and phone, the adult/child counts, pets and any notes. Use an email address you can access.",
      "Review the pet notice when bringing pets. The default rule is that the property is pet friendly, but furniture and bedrooms are not; admins may customise this notice.",
      "Submit once and keep the reference and estimated total. A pending request holds the accommodation until an administrator acts; it does not automatically expire.",
      "Whole-house requests conflict with every room reservation. Room-specific requests conflict with the same rooms, but different rooms may overlap. Checkout is exclusive, so the next stay may begin on the previous checkout date.",
      "The current availability window is 1-90 nights, up to 548 days ahead. Pending and confirmed reservations are distinguished in the calendar, but both prevent conflicting requests."
    ],
    caution: "The current website form submits external whole-house requests at public rates, including when reached from the member console. Room-specific member bookings and member pricing are supported by the backend, but there is no complete member room-booking form. Contact an admin before submitting a request that needs those arrangements."
  },
  {
    id: "manage", title: "Find, change or withdraw a booking", audience: "Guests, members and admins",
    intro: "Your signed-in account can manage bookings attached to it. Anonymous bookings are managed through a private link, not by knowing a reference alone.",
    steps: [
      "Check My Booking History in the Member Console or My Bookings & Accommodation in the Guest Booking Portal. Use the booking's manage link where available.",
      "Alternatively open Manage by Reference and supply the reference and matching email. For an unsigned-in visitor, this requests an emailed private link; the reference/email combination does not grant direct access.",
      "Open the private link to review dates, guest total, pets, notes and lead contact details. Keep this link confidential.",
      "Save an edit only when ready. Saving returns the booking to Pending and clears any previous approval, including note-only changes. The accommodation is checked for conflicts again.",
      "Date changes may recalculate the estimate using current rates. Note-only edits preserve the amount. A guest-count change requiring a new guest-category breakdown, or an older booking without that breakdown, needs admin assistance or a new request.",
      "To withdraw a request or cancel a stay, contact an admin. There is no dedicated self-service cancellation button. Do not assume changing a note cancels a booking; ask the admin to reject/release it and verify the status."
    ],
    caution: "Email delivery must be configured for private-link lookup. If a request appears to fail or no email arrives, check existing bookings with an admin before submitting again."
  },
  {
    id: "approvals", title: "Approve bookings and maintain the history", audience: "Admins",
    intro: "Overview shows current requests and active stays. Bookings is the fuller workspace for decisions, comments, policy and audit history.",
    steps: [
      "Open Bookings and review Pending Approvals. Check dates, guests, pets, notes and the proposed amount. Confirm member-specific arrangements separately when the public form was used.",
      "Approve an acceptable request. The server checks for conflicts before recording approval. Approval confirms the reservation; it is not confirmation of payment.",
      "Use the booking's comment action to record a clarification. To decline a request or reject an existing booking, enter a clear reason and use Reject.",
      "Rejected bookings release their accommodation and should appear in History & Audit Trail rather than the active list. Expand a history entry to read its creation, approval, rejection and comment records.",
      "In Booking Policy, update the pet notice and the Guest Portal Useful Info title/body. Replace example contact numbers with verified ones; one notice-board item is shown for each non-empty line."
    ],
    caution: "History records app actions, not offline conversations or a bank reconciliation. Add a clear comment when an important decision was made outside the app."
  },
  {
    id: "accounts", title: "Add users and review registrations", audience: "Admins",
    intro: "Direct account creation and invitations are different workflows. Self-registration from an invitation still needs administrator review.",
    steps: [
      "Open User Administration to create an account directly with name, email, role and a strong initial password. Share initial credentials privately and have the user change their password with admin assistance.",
      "For self-registration, create/send an invitation with the intended role and email. The recipient follows the invitation link and supplies their registration details.",
      "Review the submitted registration and approve or reject it. Sending an invitation by itself does not activate a new member account.",
      "Use account controls to update details, password, role or active status. Admin is an explicit appointment, not a synonym for shareholder.",
      "Keep at least one working super-admin account. Do not deactivate or demote the last one, or change your own access without another super-admin available."
    ],
    caution: "Invitations depend on email setup. Never reuse the local-development sample passwords for real family accounts."
  },
  {
    id: "finances", title: "Track member fees and expenses", audience: "Admins; members and shareholders have different read access",
    intro: "The finance screens are operational records, not an automatic bank feed, payment gateway or full accounting system.",
    steps: [
      "In Finances > Member Fee Tracking, select the member and review the monthly amount, recorded arrears, due date and reminder settings before saving changes.",
      "Use Record Member Fee Payment for amount, method, status, months covered, coverage start and reference. Confirm that money was received before choosing a confirmed status, and avoid recording the same payment twice.",
      "Members see their own fee status and reminder preferences in My Fees. Shareholders can use Member > Financial Records to view and export the wider financial records without editing them.",
      "Use Expenses Ledger to enter the expense details, category, amount and dates, attaching an appropriate invoice if needed. Review the summary and recorded rows afterwards.",
      "Export the expenses ledger as CSV or XLSX. For imports, follow the screen's supported format/columns, keep a backup/export first and review the imported result. Do not assume repeated imports are automatically deduplicated.",
      "Reconcile balances and member coverage against the real bank records. Reminder delivery needs both configured email and an operator-configured scheduled reminder job. Setting a reminder preference alone does not schedule the server."
    ],
    caution: "Booking tariffs are separate from monthly member fees. There is no complete room/tariff configuration screen here; ask the technical administrator to verify that setup. Do not treat a recorded payment method as proof of a working online payment integration."
  },
  {
    id: "maintenance", title: "Assets and maintenance", audience: "Members and admins",
    intro: "Use maintenance for physical house work, and App Feedback for problems with this software. A task being approved is not the same as it being completed.",
    steps: [
      "Members: in Assets & Maintenance Workflow, use Report Maintenance Task. Describe the fault/work, choose the asset when relevant, set the priority and add a supporting document if useful. Track it in My Maintenance Tasks.",
      "Admins: open Maintenance and review Pending Approval. Approve appropriate work or reject it with a reason. Review the In Progress queue and mark work complete only after it has been checked.",
      "Use task document fields for invoices or supporting evidence. Review Completed / Rejected Tasks when following up on earlier work.",
      "In Asset Management, add or update the asset record, condition/status and warranty details, and link useful warranty or purchase documentation. Members can consult the asset registry."
    ],
    caution: "Uploaded files are currently reachable by anyone with the file URL. Do not upload identity documents, unredacted bank details, passwords or sensitive invoices. Use a separate secure channel for confidential evidence. For urgent safety issues, contact the house team directly."
  },
  {
    id: "decisions", title: "Propose decisions and vote", audience: "Members and admins",
    intro: "A proposal is a request to hold a poll. An active poll is open to its selected audience, not automatically to every account.",
    steps: [
      "Members: use Decision Voting to submit a proposed decision with a clear title and explanation. An admin must review it before it becomes a poll.",
      "Admins: in Decisions, create a poll or review a member proposal. Choose Admins Only for director-sensitive decisions, or Members and Admins for the wider eligible group; set a closing time when appropriate.",
      "Eligible users may vote Yes, No or Abstain while voting is open. A changed vote replaces that person's previous choice rather than adding another vote.",
      "Use the tracking visual for counts and participation. Members cannot see director-only polls or private admin review notes. Guests cannot vote.",
      "Close a poll when finished and communicate the decision and next steps. Participation is based on currently eligible active accounts; it is not a frozen shareholder roll or share-weighted vote."
    ],
    caution: "The app does not apply formal quorum, tie-breaking or legal decision rules. Vote totals do not automatically declare a binding outcome. Agree those rules outside the app before relying on a poll."
  },
  {
    id: "communications", title: "Guest feedback and booking emails", audience: "Guests and admins",
    intro: "Guest Feedback concerns a stay. App Feedback concerns the software. They are separate records with different visibility.",
    steps: [
      "Guests and members can submit stay feedback from the Guest Booking Portal. New public submissions await moderation rather than appearing immediately.",
      "Admins: open Guest Feedback to review entries, change public/internal visibility and publish or unpublish. Check content for personal information before publishing it.",
      "Open Email Templates to edit the booking request receipt, admin approval request, approval and rejection templates. Select a template, edit subject/body and save; preserve any placeholders you need.",
      "The system has booking receipt, approval and rejection emails, with private management links where applicable. Booking edits can send a new receipt and approval request.",
      "Invitations and subscription reminders are not all controlled by the booking template editor. A template edit is not a mail-delivery test; ask the operator to confirm SMTP and check the recipient's spam folder if mail is missing."
    ],
    caution: "Email availability and actual delivery have not been verified by this guide. A status saved in the app and a message received in an inbox are different events."
  },
  {
    id: "telegram", title: "Telegram availability (when enabled)", audience: "Members and admins",
    intro: "The Telegram integration is a guided availability checker using buttons and explicit commands. It does not use an AI model.",
    steps: [
      "An operator must first configure the bot credentials and HTTPS webhook. An installed app or Telegram menu alone does not mean a live bot is connected.",
      "Sign in and choose Connect Telegram from the Member Console, or open the Telegram screen as an admin. Generate your personal link, open it in Telegram and press Start within 10 minutes. Do not share the link.",
      "Use /availability in private chat, then select the whole house or rooms and your dates. A shortcut is /availability YYYY-MM-DD YYYY-MM-DD, with real dates in that format.",
      "Admins may approve a family Telegram group using its group ID in Admin > Telegram. Approved-group commands send people to private chat; membership of a group does not grant website/bot access.",
      "Use the website's disconnect control if you need to unlink an account. Inactive, guest or unlinked accounts cannot use protected availability."
    ],
    caution: "Telegram cannot create, change, cancel or approve bookings. WhatsApp and unrestricted AI conversation are not implemented. External Airbnb/Booking.com settings do not provide a working automatic reservation sync."
  },
  {
    id: "tool-feedback", title: "Give private feedback about this app", audience: "Admins only",
    intro: "App Feedback is a shared admin notebook for problems, suggestions and general comments. It is not an emergency channel or an automatic development ticket service.",
    steps: [
      "Open App Feedback and expand Share a problem, suggestion or comment. Choose the type, enter a short title and describe the page, steps, expected result and actual result.",
      "Submit the item, then select a discussion to read or reply. Current and newly appointed admins can see the same retained discussions; members, shareholders and guests cannot.",
      "Use the status filter and type filter to find relevant items. Pages keep long lists manageable; Refresh list checks for new discussions.",
      "Set New, Under Review, Planned or Resolved as appropriate. Any appointed admin may update status. Every change records the admin, time and old/new status.",
      "Replies and status changes appear newest first. Use Load older updates for earlier history. If another admin changed the discussion, refresh before retrying a status update.",
      "Posts and replies are retained without edit/delete controls. Add a correction as a reply. There are no attachments, email alerts, assignments or promised delivery dates in this first version."
    ],
    caution: "Do not post passwords, tokens, private booking links or confidential personal documents. This is shared among all current and future appointed admins, not a private message to one person."
  },
  {
    id: "troubleshooting", title: "Quick answers and getting help", audience: "Everyone",
    intro: "Use the booking record and the relevant module as the source of truth. When asking for help, include the page name, time, reference if appropriate and what you expected, but never a password or private token.",
    steps: [
      "Why are dates blocked when a booking is not approved? Pending requests hold their accommodation too. Ask an admin to review or reject an abandoned request.",
      "Why did my approved booking return to Pending? A saved edit resets approval. Ask an admin to review the updated request; do not assume the previous approval still applies.",
      "Why can I not see the admin menu? Shareholders are read-only for finance and are not admins by default. Check your appointed role with a super-admin.",
      "Why has an email not arrived? Check the email address and spam folder, then ask an admin/operator to check mail setup. Do not submit duplicate bookings just to trigger another email.",
      "Does the app take payment or guarantee a price? It records charges/payment information, but does not provide a verified online checkout or automatic bank reconciliation. Confirm the payment arrangement and final charge with an admin.",
      "Who should I contact? Use the verified Useful Info board in the Guest Booking Portal. Members should report property faults through maintenance; admins should report software issues through App Feedback."
    ]
  }
];
