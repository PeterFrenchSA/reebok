export type GuideSection = { id: string; title: string; audience: string; intro: string; steps: string[]; caution?: string };
export const guideReviewDate = "14 November 2026";
export const guideSections: GuideSection[] = [
  {
    id: "access", title: "Start here: accounts and roles", audience: "Everyone",
    intro: "One house, several kinds of access. Your role determines what you can see and do; being a shareholder does not make you an administrator.",
    steps: [
      "Use the house website link supplied by your administrator and sign in. Coolify is the hosting control panel, not the family login page.",
      "Guests use My Stay for their own accommodation, guest feedback and Useful Info. Members and admins may also use My Stay for their own stays. On smaller screens, open Menu to switch portals.",
      "Family home has shortcuts to upcoming stays, fees, maintenance and eligible decisions. Use the Family menu for separate pages; on mobile, expand it with Browse. Shared calendars show lead member names, not contact details or another family's prices and private record. Guest stays remain anonymous.",
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
      "Signed-in members, shareholders and admins use the member booking page: choose Shared family stay for one or more rooms, or Whole house for exclusive use. Guests use the public whole-house form with adult/child counts.",
      "Members: count each person once under the existing member/dependent/guest/other-family categories. For a shared stay, select available rooms and assign every guest to a room, within its capacity. An optional family/group label helps identify each party. You can submit separate family bookings for the same dates in different rooms.",
      "Enter lead contact details, pets and notes. Members receive updates at their account email. Review the per-category member estimate before submitting; the server checks rates and availability again.",
      "Review the pet notice when bringing pets. The default rule is that the property is pet friendly, but furniture and bedrooms are not; admins may customise this notice.",
      "Submit once and keep the reference and estimated total. A pending request holds the accommodation until an administrator acts; it does not automatically expire.",
      "Whole-house requests conflict with every room reservation. Room-specific requests conflict with the same rooms, but different rooms may overlap. Checkout is exclusive, so the next stay may begin on the previous checkout date.",
      "Member/family bookings allow 1-10 nights, including admins using member rates; guest bookings retain 1-90 nights. These are per-booking limits, not a combined allowance across separate bookings. Dates must be within 548 days ahead. Pending and confirmed reservations look different in the calendar, but both prevent conflicting requests."
    ],
    caution: "Whole-house means exclusive use and blocks every room, even for a small party. Some rooms available does not mean every room is free. Room 5 is limited to two guests until its extra bed is confirmed. If an old family booking blocks the whole house incorrectly, ask an admin to correct its allocation; never assume it has been converted automatically."
  },
  {
    id: "manage", title: "Find, change or withdraw a booking", audience: "Guests, members and admins",
    intro: "Your signed-in account can manage bookings attached to it. Anonymous bookings are managed through a private link, not by knowing a reference alone.",
    steps: [
      "Open Family > My bookings or My Stay > My Bookings & Accommodation. Switch between Current & upcoming and Booking history. Rejected and cancelled stays are in history even if their dates are still in the future. Use the booking's manage link.",
      "Alternatively open Manage by Reference and supply the reference and matching email. For an unsigned-in visitor, this requests an emailed private link; the reference/email combination does not grant direct access.",
      "Open the private link to review dates, guest total, pets, notes and lead contact details. Keep this link confidential.",
      "Save an edit only when ready. Saving returns the booking to Pending and clears any previous approval, including note-only changes. The accommodation is checked for conflicts again.",
      "Existing longer stays are not automatically shortened or cancelled. A member/family stay over 10 nights must be shortened before saving changes or receiving a new approval; contact an admin if you need help.",
      "Date changes may recalculate the estimate using current rates. Note-only edits preserve the amount. A guest-count change requiring a new guest-category breakdown, or an older booking without that breakdown, needs admin assistance or a new request.",
      "To withdraw a request or cancel a stay, contact an admin. There is no dedicated self-service cancellation button. Do not assume changing a note cancels a booking; ask the admin to reject/release it and verify the status."
    ],
    caution: "Email delivery must be configured for private-link lookup. If a request appears to fail or no email arrives, check existing bookings with an admin before submitting again."
  },
  {
    id: "approvals", title: "Approve bookings and maintain the history", audience: "Admins",
    intro: "Overview is a short house desk with requests and upcoming stays. Use Booking calendar for visual management or Approvals & history for lists and audit records.",
    steps: [
      "Open Approvals & history and review Pending Approvals at the top, or select a stay in Booking calendar. Check dates, room allocations, guest categories, pets, notes and the proposed amount.",
      "For a future family stay entered with the wrong accommodation, expand Correct member accommodation / release unused rooms. Confirm the family agrees, select rooms or the whole house, check the categories and revised estimate, and record a reason. This retains the party size and dates, recalculates member pricing, logs the correction and returns the booking to Pending. Notify the family directly: the correction itself sends no email. Public bookings can be converted only when owned by an active member account.",
      "Approve an acceptable request. The server checks conflicts and stay length before recording approval. Member/family stays have a 10-night cap with no admin override; guest stays retain 90 nights. Shorten longer member stays through Change dates before approval or accommodation correction. Approval confirms the reservation, not payment.",
      "Use the booking's comment action to record a clarification. To decline a request or reject an existing booking, enter a clear reason and use Reject.",
      "Rejected bookings release their accommodation and should appear in History & Audit Trail rather than the active list. Expand a history entry to read its creation, approval, rejection and comment records.",
      "Open House notices & booking settings from Approvals & history to update the pet notice and My Stay Useful Info title/body. Replace example contact numbers with verified ones; one notice-board item is shown for each non-empty line."
    ],
    caution: "History records app actions, not offline conversations or a bank reconciliation. Add a clear comment when an important decision was made outside the app."
  },
  {
    id: "calendar", title: "See who is staying and manage the calendar", audience: "Members and admins",
    intro: "The room planner, month view and agenda show the same reservations. Pending and approved stays both hold accommodation; rejected/cancelled stays do not.",
    steps: [
      "Members open Who's staying; admins open Booking calendar. Switch between Room planner, Month and Agenda. Agenda opens first on small screens. Use Today, Previous, Next or Jump to date, then filter accommodation and status. On phones, expand Filters & calendar help for those controls.",
      "The planner shows one row per room over two weeks. A whole-house stay appears across every room. A stay occupies its check-in nights, not its checkout day. Pending holds have a striped treatment and label; approved stays have a solid green treatment.",
      "Members see the lead member/account name and accommodation summary. Names of external guests, contact details, private notes and other families' prices are not shared. Your own stay has a Manage my booking link. The family calendar shows current/upcoming active stays, not other families' booking history.",
      "Admins can select any stay for details, approval, rejection, comments and audit history. Select All statuses to include rejected/cancelled history. Close returns to the same calendar context; drag-and-drop changes are deliberately not enabled.",
      "To reschedule, expand Change dates, select check-in/check-out, review the new estimate and enter a reason/agreement. Saving rechecks availability, records the change and returns the stay to Pending. Rooms and guest categories remain unchanged. Notify the family directly: no rescheduling email is sent. If another admin changes the booking first, refresh before retrying."
    ],
    caution: "Calendar availability is a view, not a guarantee until the server accepts a request. Use Refresh calendar for recent changes from another device. Approval confirms accommodation, not payment."
  },
  {
    id: "google-sheets", title: "Share a reporting workbook", audience: "Admins configure; the owner controls Google sharing",
    intro: "Google Sheets is a one-way reporting copy of the booking roster, expenses, payments and member fees. The app remains the source of truth.",
    steps: [
      "Open Admin > Google Sheets. Create a blank workbook in the owner's personal Google account, then ask the operator to configure the dedicated service account and five-minute scheduled job. No Gmail password is required.",
      "Share that workbook with the integration email displayed in the app as Editor. Paste the workbook link, acknowledge the sharing warning, enable and save. Run Sync now and verify the last-success timestamp and all five tabs, including Readme.",
      "Grant family access directly in Google Drive. Anyone with workbook access can see all tabs, including finances; app roles do not apply inside Google. Keep access limited to people entitled to those records.",
      "The managed tabs include all history, even rejected/cancelled bookings, and are replaced on each sync. Put manual calculations and notes in separate tabs. Pre-existing tabs are not silently adopted or overwritten.",
      "Check Last verified success, row counts and Last scheduler check-in. Failed runs retry later with increasing delays. A disconnected Google account does not stop booking in the app. Refresh status after a manual retry.",
      "Treat estimates, payment statuses and arrears according to their labels; this is not bank reconciliation or a backup. Contact fields, private booking notes, management links and document URLs are excluded. Titles and references are exported, so do not put secrets in them."
    ],
    caution: "Until the workbook, runtime credentials and scheduled job are configured and a live sync is verified, no automatic reporting is operational. Hiding a tab is not a privacy boundary."
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
    caution: "Booking tariffs are separate from monthly member fees. Use Pricing & Rooms for accommodation tariffs; changing a subscription default does not update existing individual subscriptions. Do not treat a recorded payment method as proof of a working online payment integration."
  },
  {
    id: "pricing", title: "Publish tariffs and maintain rooms", audience: "Admins",
    intro: "Pricing & Rooms manages dated accommodation tariffs and the bookable room inventory. Shareholders retain read-only financial API access; they cannot publish changes.",
    steps: [
      "Review all six existing member guest-category prices. They apply per person per night for both room bookings and whole-house member stays; there is no separate member whole-house surcharge.",
      "Set external adult and child-under-six rates, currency and any external whole-house minimum. The minimum is for the entire stay, not per night. Add annual external seasonal rates with unique priorities; higher priority wins on overlapping nights. Seasons do not change member rates.",
      "Choose an effective check-in date and publish a new version. The latest applicable version at check-in governs the stay; external seasons are evaluated night by night. Existing saved booking totals and individual subscriptions are not automatically changed. Date edits and admin accommodation corrections may recalculate an estimate.",
      "Use Pricing versions to inspect past values or load them as a new draft. If another admin publishes while you are editing, reload before trying again. No bookings can be priced without an applicable published tariff.",
      "Review Room inventory. Only an empty inventory offers Install the seven confirmed rooms. Existing installations must review/edit their current room records and add missing rooms; do not duplicate or rename occupied rooms without checking their physical identity. Room 5 remains capped at two. The confirmed seven-room total is 23.",
      "Do not reduce capacity or disable a room needed by an active reservation. The app blocks changes that invalidate room allocations or exceed the remaining house capacity. Existing whole-house bookings are not split automatically."
    ],
    caution: "Publish only agreed family tariffs. No new approved prices are invented by this screen. Room descriptions are visible to members; do not put private notes in them."
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
