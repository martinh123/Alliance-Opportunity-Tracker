# Prompt for SiteGround AI Website Builder — GSI Partner Opportunity Tracker on WordPress

Copy everything below this line into the AI tool.

---

## Project Brief

Build a private, login-required **B2B sales opportunity tracker** for a team that manages deals sourced through GSI (Global System Integrator) partners. This is an internal web application, NOT a public marketing site. All data lives in the WordPress database (custom tables and/or custom post types with meta). No content should be visible to logged-out visitors except the login screen.

The application tracks: GSI partner companies, the sales opportunities attached to each partner, MEDDPICC deal-qualification scoring for every opportunity, follow-up reminders, and contact directories. It is multi-user with two permission levels.

---

## 1. Users & Roles

Use WordPress users with two custom roles:

- **`gsi_admin`** — full access: manage all users, create/edit/delete any record, export all data, view every screen.
- **`gsi_rep`** — standard salesperson: create and edit partners, opportunities, MEDDPICC notes, reminders, and contacts. Cannot manage users or perform data exports.

Registration is closed — only a `gsi_admin` can create accounts. Every user has: display name, email (login), role, region (text), and annual quota (number). Store these as user meta.

---

## 2. Data Model

Create these entities. Prefer custom database tables (via `dbDelta`) for the relational ones; custom post types with ACF-style meta are acceptable where noted.

### 2.1 Partners (custom post type acceptable)
- `name` (title), `region` (text), `tier` (text), `website` (URL)
- `portal_url` (URL — partner's deal-registration portal)
- `notes` — a LIST of timestamped notes (see 2.7)

### 2.2 Opportunities (custom table recommended; this is the core entity)
- `name` (text, required)
- `type` — "opportunity" (default) or "lead"
- `partner_id` — FK to Partners (required; deleting a partner deletes its opportunities)
- `owner_id` — FK to WP user (required)
- `stage` — one of: `Qualify`, `Discovery`, `Propose`, `Negotiate`, `Commit`, `ClosedWon`, `ClosedLost`, `Dormant` (default `Qualify`)
- `end_customer` (text), `end_customer_domain` (text)
- `revenue_value` (decimal 15,2), `close_date` (date), `date_in` (date)
- `country` (text), `hpe_team` (text), `use_case` (text), `num_endpoints` (int)
- `partner_contact` (text), `partner_contact_role` (text)
- `description` (long text)
- `meddpicc_score` (decimal 0–100, computed — see section 4)
- `closed_won_at` (datetime, nullable — see business rules)
- `notes` — LIST of timestamped notes (see 2.7)
- `contacts` — LIST of contact objects `{name, role, email, phone}`
- `created_at`, `updated_at`

### 2.3 MEDDPICC Entries (custom table)
One row per note per element per opportunity:
- `opportunity_id` (FK, cascade delete)
- `element` — one of the 8 element keys: `metrics`, `economic_buyer`, `decision_criteria`, `decision_process`, `paper_process`, `identify_pain`, `champion`, `competition`
- `content` (text)
- `customer_validated` (boolean, default false)
- `relevance_score` (int 1–5, nullable)
- timestamps

### 2.4 Partner Resources (contact directory, custom table)
People who work at partner companies: `partner_id` (FK), `name` (required), `role`, `email`, `phone`, `notes` (list of timestamped notes).

### 2.5 Internal Resources (contact directory, custom table)
Internal teammates/specialists: `name` (required), `role`, `team`, `email`, `phone`, `region`, `notes` (list of timestamped notes).

### 2.6 Reminders (custom table)
- `user_id` (FK), `opportunity_id` (FK, nullable)
- `title` (required), `due_date` (date), `completed` (boolean)

### 2.7 Timestamped Notes pattern
Wherever an entity has "notes", store a JSON array of `{id: uuid, text: string, createdAt: ISO datetime}`. Notes are individually added and deleted, never overwritten as one blob. Display newest first with a relative date ("2 days ago").

---

## 3. Pages / Screens

All pages require login except `/login`. Build as a WordPress theme with custom page templates (or a plugin rendering shortcodes) — clean, modern SaaS dashboard styling: light background, a fixed left sidebar for navigation, card-based layout, a single accent color, no clutter.

### 3.1 Login
Email + password. On failure show a clear error. No self-registration link.

### 3.2 Dashboard (home after login)
- KPI cards: total pipeline (sum of `revenue_value` for active stages), weighted pipeline (each deal × its MEDDPICC score / 100), win rate (ClosedWon ÷ all closed), average deal size.
- A "Needs attention" list: active deals with no update in 14+ days or a close date in the past.
- Partner summary table: each partner with count of active opportunities and total pipeline value. Rows expand to show that partner's deals with inline stage editing.
- Quarter / fiscal-year filter toggle.

### 3.3 Partners
List of partner cards with region/tier. Create and edit via modal dialogs. Each partner links to a filtered view of its opportunities and its contact directory.

### 3.4 Opportunities
Filterable table of all active opportunities (stage not in ClosedWon/ClosedLost/Dormant): filters for partner, type, owner, close-date range, plus name search. "New opportunity" button opens a form dialog. Each row links to the detail page. Show stage as a colored badge and the MEDDPICC score as a small progress ring or bar.

### 3.5 Opportunity Detail (the most important screen)
Header: name, partner, stage dropdown (inline editable), revenue, close date, owner, end customer.
Tabbed sections:
- **Workspace** — all metadata fields, editable; the timestamped notes list; the contacts list.
- **MEDDPICC** — one card per element (8 total). Each card: element name, list of entries (text + "customer validated" checkbox + relevance 1–5 selector), add-entry input, and a per-element strength indicator. The overall 0–100 score updates automatically whenever entries change (server-side — see section 4).
- **Actions** — reminders tied to this opportunity: add title + due date, check off complete.
- **Resources** — related partner contacts and internal resources.

### 3.6 Outcomes
Historical archive: opportunities in ClosedWon / ClosedLost / Dormant, grouped by partner, with totals for won revenue. Read-only except a "reopen" stage change.

### 3.7 Profile
Current user's name, email, role, region, quota. Logout button.

### 3.8 Admin → Users (gsi_admin only)
Table of all users. Create user (name, email, password, role, region, quota), edit, delete. Also an "Export data" button producing a full JSON download of all entities.

---

## 4. MEDDPICC Scoring — implement exactly

Eight elements with weights:

| Element | Weight |
|---|---|
| Metrics | 15% |
| Economic Buyer | 15% |
| Identify Pain | 15% |
| Champion | 15% |
| Decision Criteria | 10% |
| Decision Process | 10% |
| Paper Process | 10% |
| Competition | 10% |

Per element, compute a strength from 0.0–1.0 as a blend of three signals:
- **Presence (40%)** — 1.0 if the element has at least one entry, else 0.
- **Validation (40%)** — fraction of that element's entries marked `customer_validated`.
- **Relevance (20%)** — average `relevance_score` of entries that have one, divided by 5.

`overall_score = Σ (element_weight × element_strength) × 100`, rounded to 2 decimals.

**Critical rule: the score must be computed and stored server-side (PHP) whenever a MEDDPICC entry is created, edited, or deleted — never trusted from the browser.** Only rep-entered entries count toward the score; any AI-generated research text is display-only and must never affect scoring.

---

## 5. Business Rules

1. **closed_won_at**: when a deal's stage first changes to `ClosedWon`, set `closed_won_at` to now, server-side. If the deal is later reopened (stage changed away), do NOT clear the timestamp; if it is set to ClosedWon again, do not overwrite the original timestamp.
2. **Active vs closed**: active = Qualify/Discovery/Propose/Negotiate/Commit. Dashboard and Opportunities list show active only; Outcomes shows the rest.
3. **Cascade deletes**: deleting a partner removes its opportunities; deleting an opportunity removes its MEDDPICC entries and research.
4. **Data privacy**: every list and detail query must be permission-checked server-side. Nothing is public.
5. If `end_customer_domain` changes on an opportunity, clear any stored research text for it (prevents stale intel).

---

## 6. Nice-to-have (build if the tool supports it)

- **AI company research**: a button on the opportunity detail page that asks an AI (with web search) to summarize the end customer's business priorities relevant to a chosen MEDDPICC element, showing a summary paragraph plus source links. Store per-opportunity, display-only.
- **CSV/Excel contact import**: upload a spreadsheet of contacts, map columns to fields (name required), skip duplicates, report inserted/skipped counts.

---

## 7. Style Guide

- Professional SaaS aesthetic: white/very-light-gray background, dark slate text, ONE accent color used for primary buttons, active nav item, and stage badges.
- Left sidebar navigation: Dashboard, Partners, Opportunities, Outcomes, Profile, (Users — admins only).
- Cards with subtle borders and small shadows; generous whitespace; system font stack or Inter.
- No emojis in the UI. No stock photos. Data-dense tables with clear typography.
- Fully responsive — usable on a phone.
