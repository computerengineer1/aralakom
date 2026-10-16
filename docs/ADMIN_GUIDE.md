# Administrator Guide

Audience: the company **Owner** and **Administrators** (and, where noted, HR /
Project Managers / Accountants). Everything here happens in the internal app
(`/app`) after signing in.

---

## 1. First-time setup (Owner)

1. Ask your technician to complete README “Quick start” through migrations.
2. Create the owner account with the documented CLI (`npm run setup:owner`). The
   password is entered hidden; there is **no default password**.
3. Sign in at `/login`, then **enable MFA**: Profile → Security → Enable MFA →
   scan the QR with an authenticator app (e.g. any TOTP app) → confirm a code.
4. Go to **Settings → Company & branding** and replace all placeholder branding:
   company name (EN/AR), tagline, about text, phone/WhatsApp/email, addresses,
   working hours, default language (Arabic or English), primary currency, legal
   entity, tax ID, invoice footers. Saving requires a session no older than 30 min
   (step-up protection) — re-login if prompted.
5. Review **Settings → Categories**: trades, engineering disciplines and customer
   request categories are fully configurable (add/deactivate; codes are stable ids).
6. Review **Settings → Website services** and **Portfolio**: what the public sees.
   Portfolio items are only visible publicly when *published*; cover images are
   uploaded there and served through the public file route.
7. If you handle money in both currencies, add verified **Exchange rates** with
   their real source and date. The system will never invent a rate.

## 2. Staff accounts & permissions

**Users** (owner/admin only):

- *Add staff*: choose role — Administrator, HR Manager, Project Manager, Accountant,
  Engineer/Staff, Worker. Optionally set a temporary password (the user must change
  it at first login) or leave empty so they self-serve “Forgot password”.
- *Roles are enforced server-side*. Summary of what each role can do:
  - **Owner**: everything, including owner-only actions (create admins, delete accounts, retention).
  - **Administrator**: full operations incl. settings and users (cannot modify owner accounts or grant owner/admin unless owner).
  - **HR Manager**: personnel records (incl. compensation/emergency fields), applications review, directory exports; reads requests; no finance.
  - **Project Manager**: projects (all), milestones/tasks/team/issues, scheduling + attendance approval, expenses; no quotes approval, no user management, no worker payments.
  - **Accountant**: quotes (create+approve), contracts, invoices, receipts, expenses, receivables, reports, worker payments, exchange rates; no user management.
  - **Engineer/Staff & Worker**: only their own profile, assigned projects/tasks, own schedule/attendance/payments.
  - **Customer**: only their own requests/projects (account optional; public tracking works without accounts).
- *Suspend/activate*: suspending revokes all sessions immediately.
- *Send password reset*: emails a single-use 30-minute link and revokes sessions.
- *Delete*: owner-only soft delete (history preserved).
- Encourage **MFA** for privileged roles; the login flow enforces it once enabled.

## 3. Approving applicants (HR)

1. **Job Applications** → open an application.
2. Use the status machine: Submitted → Under review → Shortlisted → Interview →
   Approved → **Hired**. Invalid jumps are rejected by the server.
3. *Internal notes* are never visible to the applicant; *messages to applicant*
   (EN/AR) appear on their tracking page and can be emailed (if SMTP configured).
4. Setting **Hired** automatically creates a personnel record (EMP-number) linked
   to the application — the applicant cannot choose their own status, role or pay.
5. Data correction/deletion requests submitted by applicants arrive as internal
   events on the application; act on them per the retention policy
   (applications: 24 months default guidance; finance records: legal retention).

## 4. Processing customer requests (PM/Admin)

1. **Contract Requests** → open a request. The banner reminds staff that nothing is
   promised to the customer until confirmed.
2. Move through: Under review → (Needs info / Site visit) → Estimating → Quotation
   prepared/sent → Accepted → **Convert to project** (creates PRJ-number, links
   customer + history, optional contract amount).
3. *Customer messages* (EN/AR) are visible on the tracking page; *internal notes* are not.
4. Schedule **site visits** from the request page.

## 5. Managing projects

- **Projects** → create (or from request conversion). Assign a PM, dates, contract
  and budget amounts *with currency*.
- Use **Milestones** (weighted) for real progress — the dashboard computes progress
  from completed milestone weights and task states, not arbitrary percentages.
- **Tasks** can be assigned to personnel or staff; assignees may update status only.
- **Team**: add personnel/users; archived personnel cannot be assigned.
- **Issues & Risks**, **Site notes**, **Handover checklist** are per-project.
- **Expenses** are categorized (labor/materials/equipment/transport/subcontractor/
  misc) and always carry a currency; the Financials tab groups everything **per
  currency** (LBP and USD are never mixed).
- Overdue milestones/tasks surface on dashboards and **Projects → alerts**.
- Archiving preserves all history (required when staff leave or projects close).

## 6. Scheduling & attendance (PM)

- **Scheduling**: assign person + project + date + shift. The database prevents
  double-booking (clear 409 message).
- **Attendance/timesheets**: supervisors record hours (regular/overtime) and
  *submit*; approvers (PM/owner/admin) *approve*. Editing an approved record
  returns it to “submitted” — every change is audited.
- **Worker payments** (accountant/owner/admin): advances/payments/settlements with
  approval flow; recent authentication is required to approve. The balance view
  never fabricates earnings — it only combines configured rates with approved
  hours, and prints the payroll disclaimer (verify statutory rules with your
  accountant/legal adviser).

## 7. Quotations, contracts, invoices (Accountant)

- **Quotation**: choose customer + currency, add itemized lines (labor/material/
  equipment), discounts and tax. Drafts are editable; after submission the flow is
  *Pending approval → Approved (step-up auth) → Sent → Accepted/Declined/Expired*.
  Create **new versions** instead of editing sent quotes. Export **PDF (EN/AR)**
  only after approval — exports are audited.
- **Contracts**: reference the quote/project, amount+currency, dates, payment
  schedule lines, signed document upload, and **change orders** with approval.
  Generated documents are templates — have your legal adviser review contract text.
- **Invoices**: itemized, unique numbers (INV-year-####), states draft→sent→
  partial/paid. **Record payment** with amount ≤ balance and matching currency;
  the same bank/check reference cannot be recorded twice for one invoice
  (duplicate-payment guard). Voiding recalculates balances transactionally.
- **Receivables** report lists outstanding balances per customer **per currency**.

## 8. Notifications

- In-app bell shows unread items; admins see the **delivery log** (channel, status,
  attempts, last error) and can retry failed emails or broadcast in-app messages.
- Email requires SMTP in Settings/env. Without it, messages are saved to
  `data/outbox` and marked `skipped` — the system never claims false delivery.
- Applicant/customer emails are sent only for permitted status changes and only to
  addresses they provided (consent recorded at submission).

## 9. Audit & oversight

- **Audit log** (owner/admin/accountant): who did what, when, from which IP, with a
  minimal redacted summary. It is append-only — no role can edit or delete entries
  through the app. Review after: role changes, exports, approvals, deletions,
  settings changes, repeated failed logins (`auth.login_failed`).
- **Settings → System health**: DB connectivity, environment, SMTP status, locale
  and currency defaults.

## 10. Housekeeping policies to set with management

- Retention: applications (suggest 24 months), personnel (employment law),
  financial records (Lebanese accounting retention), audit (suggest ≥ 2 years).
- Who may export CSV/PDF (exports are audited; keep the list short).
- Backup responsibility and restore-test cadence (see DEPLOYMENT.md).
- Quarterly access review: suspend leavers the same day (sessions die instantly).
