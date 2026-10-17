> **Direction changed:** the user authorized a single-owner local app without dashboard sign-in. [local-app-plan.md](local-app-plan.md) supersedes the hosted/auth/database/staff/hosting choices below. Product definitions and later-feature boundaries still apply.

# Wayfind Command Center — Build Plan (v2)

Version 2.0 · October 17, 2026
Replaces: `Wayfind_Command_Center_Build_Plan.md` v1.0

---

## 1. How to use this document

Hand this file to a coding agent and say:

> Read `docs/build-plan.md`. Implement **Phase N only**. Run that phase's checks, update `docs/status.md`, and stop.

Rules for the implementing agent:

1. Do one phase per run. Don't build ahead because scaffolding makes it easy.
2. Make routine technical choices yourself and note them in `docs/decisions.md`. Stop and ask only when an answer changes what the product does, who can see what, or what it costs.
3. Never fake an integration. Code tested against fixtures is "built", not "connected". Don't invent API endpoints, credentials or successful live tests.
4. Commit only **synthetic** data: no real candidate names, real exports or secrets. Real files go in `local-data/`, which is git-ignored.
5. Keep the app runnable at the end of every phase.
6. Write tests for behavior that matters (math, imports, access control). Skip tests that only check that files exist.
7. Don't build AI, chat, MCP or Claude features. They are out of scope for this plan; see §9.
8. At the end of a phase, add a short entry to `docs/status.md` covering:
   - what was built;
   - how to run it;
   - what was tested and the actual results;
   - what is blocked and on whom.

Phase 0 is the developer's job, not the agent's. It runs alongside Phase 1.

---

## 2. What we're building

A web app for Wayfind's staff. For each trucking client it answers the same questions before a client call:

1. **Spend:** What did we spend on Meta and Indeed, and what did each return?
2. **Candidates:** Where do they stand in the recruiting system (DriverHub)?
3. **Channels:** Which channel is actually producing applicants?
4. **Attention:** What needs action?
5. **Talking points:** What do we bring to the next check-in?

The visual reference is the prototype `CHWilson_CommandCenter_v5.html`. It's a mockup with embedded sample data. Copy its layout and sections, not its numbers.

**Scale:** under 5 internal users and about 25 clients. Start with one pilot client.

**v1 is upload-based.** Staff upload the Meta export, the Indeed export and the DriverHub candidate export. The app does the rest. Live API connections come later, and only where Phase 0 proves access.

### Out of scope for v1

- Writing to any outside system: no ad edits, candidate updates, messages or comment replies.
- A client-facing login portal. A printable/PDF snapshot covers sharing.
- Payments or invoicing.
- AI features.
- Scraping or reverse-engineering any vendor.

---

## 3. Phase 0 — Discovery and access checks (developer, not agent)

Run this during Phase 1. Its answers decide Phases 4–10. Record the answers in `docs/decisions.md` and `docs/access.md`.

### 3.1 Questions for the owner

| # | Question | Why it matters | Default until answered |
|---|---|---|---|
| 1 | Who is this for: Wayfind's own clients, or AvatarFleet's agency? The mockup is branded "AvatarFleet Driver Marketing Agency" and "Prepared for Kara (Avatar CSM)". | Who owns the accounts, data, hosting and branding | Wayfind; branding configurable |
| 2 | Do all clients use DriverHub/AvatarFleet as their applicant system? | Whether one candidate import format works | Yes |
| 3 | Should every staff member see every client? | Removes per-client permission work if yes | Yes: roles `admin` and `staff` only |
| 4 | Is uploading 3 exports per client per week acceptable for v1? | Whether an upload MVP is useful to him or a letdown | Yes |
| 5 | Is the dashboard shown or sent to clients? | Sets the priority of the PDF snapshot and the polish level | Yes, via PDF/print |
| 6 | How does he define "lead", "completed application", "interview" and "hire"? | Funnel labels | Below in §7.3; labelled "provisional" |
| 7 | Which referral sources count as Meta? For example, "DriverHub Landing Page" traffic usually comes from Facebook ads. | Cost per applicant by channel | Configurable mapping per client |
| 8 | Which mockup sections are must-haves for launch? Walk the mockup with him, section by section. | Scope | Funnel, ads, alerts and context in; reviews, scorecards and comments later |
| 9 | Where do contacts, packages and billing live today: HubSpot or elsewhere? Is billing even needed? | Phase 9 | Manual fields |
| 10 | How long may candidate data be kept? | Privacy and retention | Keep the latest 6 snapshots per client |

Also ask for:

- **One trusted report.** One finished client report built the way he does it today, to reconcile against.
- **Missing documents.** The hiring-standards doc and the Indeed health-check doc referenced in the mockup.

### 3.2 Access checks (do these early, they're cheap)

| Source | What to prove | How |
|---|---|---|
| **DriverHub / AvatarFleet** (highest priority) | Is there any supported way to pull candidates automatically: API, scheduled export or SFTP? Does it include stable candidate IDs, status-change dates and contact/activity history? | Email AvatarFleet support/CSM in week 1. The answer decides Phase 8 and whether "days since last contact" is ever possible. |
| **Meta** | Can a token from Wayfind's Business Manager read Insights for one client ad account? | Make a Meta app and a system-user token in his Business Manager, then make one Graph API Insights call. Note whether standard access suffices or Advanced Access is needed. |
| **Indeed** | Does Wayfind qualify for the Sponsored Jobs API with agency access to client employer accounts? Costs and quotas? | Apply via Indeed's developer docs and ask their partner team. |
| HubSpot | Do company records hold the contacts, package and billing fields seen in the mockup? | Look at one company record with him. |
| Google Calendar | Whose calendar holds client check-ins, and how is a meeting tied to a client? | Look at a few events with him. |

Each source ends in one state: `live_possible`, `upload_only`, `manual`, `unavailable` or `unknown`.

---

## 4. Tech stack

One language, one deployable app, few moving parts.

| Concern | Choice |
|---|---|
| App | **Next.js (App Router) + TypeScript**: UI and server in one project |
| Database | **PostgreSQL** (Supabase-hosted for prod; local Docker Postgres or the Supabase CLI for dev) |
| DB access | **Drizzle ORM** with versioned SQL migrations |
| Auth | **Supabase Auth**: email + password or magic link, invite-only, no public signup |
| File storage | Private Supabase Storage bucket (local disk folder in dev) |
| CSV parsing | `papaparse` |
| XLSX parsing | `exceljs`. Read values only; never evaluate formulas. |
| Money | Store as Postgres `numeric`; compute with `decimal.js`. No floats for money. |
| UI | Tailwind + a small component set (shadcn/ui is fine); tables via TanStack Table |
| Charts | Recharts, only where data supports it (see A.4) |
| Tests | Vitest for logic, Playwright for 2–3 key journeys |
| Scheduled work (Phase 6+) | Host cron hitting a protected route, plus a `sync_runs` table. No queue system unless proven necessary. |
| Hosting | Vercel or Render for the app; Supabase for DB/auth/storage. All accounts owned by Wayfind. |

**Access control:**

- All database access happens server-side. The browser never talks to the database directly.
- Enable RLS with no policies on every table, so it denies all. That way a leaked anon key exposes nothing.
- Enforce permissions in server code with one helper, `requireUser()` / `requireAdmin()`, called by every server action and route.

Pin versions. Use `npm`. Document Windows-friendly commands in the README.

### Suggested layout

```text
src/
  app/                    routes (dashboard, clients, imports, settings)
  server/
    auth.ts               requireUser / requireAdmin
    db/                   drizzle schema + queries
    importers/            meta.ts, indeed.ts, driverhub.ts (pure parse functions)
    reporting/            metrics.ts, alerts.ts (pure functions)
  components/
drizzle/                  migrations
fixtures/                 synthetic CSV/XLSX
tests/
docs/
  build-plan.md  status.md  decisions.md  access.md  metrics.md
local-data/               git-ignored real files
```

Parsing and metric code must be **pure functions** (input in, data out), separate from the database and UI. They are what gets tested hardest.

---

## 5. Data model (build tables as phases need them)

| Table | Key fields |
|---|---|
| `users` | auth id, name, email, role (`admin` / `staff`), active |
| `clients` | name, slug, active, timezone, `brand_name` |
| `client_settings` | referral-source → channel mapping, alert thresholds, funnel label overrides |
| `imports` | client, source (`meta` / `indeed` / `driverhub`), file name, sha256, storage path, period_start, period_end, snapshot_date, status (`preview` / `active` / `superseded` / `failed` / `cancelled`), uploaded_by, row_count, warnings JSON |
| `meta_rows` | import, ad_set_name, delivery, results, result_indicator, spend, impressions, reach, frequency, unique_link_clicks, budget, budget_type, starts, ends, raw JSON |
| `indeed_rows` | import, campaign, premium, impressions, clicks, apply_starts, applies, spend, job_count, row_kind (`job` / `bundle` / `organic` / `plan`), raw JSON |
| `candidate_rows` | import, row_no, first/last name, app_created, recruiting_status, referral_source, rejection_reason, app_status, owner_operator, years_exp, signed_date, cdl_exp, endorsements, equipment, start_date, position, location, days_in_funnel, `ambiguous_fields` array, raw JSON |
| `client_context` | contacts, package, links, next_check_in, notes, billing fields (optional), updated_by/at |
| `budgets` | client, source, period_start, period_end, amount |
| `audit_log` | user, action, object, at |

There is **one active import per client + source**. Uploading a new one supersedes the previous one. Old imports are kept for history and revert.

---

## 6. Phases

### Phase 1 — Skeleton

**Goal:** a clean checkout runs locally with login, a client list and an empty dashboard.

Build:

1. Next.js + TS project, lint/format/typecheck, Drizzle, local Postgres, `.env.example`, README.
2. Supabase Auth with invite-only sign-in. A script `npm run create-admin -- email@x.com` bootstraps the first admin.
3. `requireUser` / `requireAdmin` helpers. Every non-public route uses them.
4. Tables `users`, `clients`, `client_settings`, `audit_log`. Admin screen to add/edit clients and invite users.
5. App shell:
   - client switcher in the header, kept in the URL (`/c/[slug]/...`);
   - pages Dashboard, Imports and Settings;
   - dashboard sections as empty states that say which upload fills them.
6. Seed script with two **synthetic** clients.
7. CI: lint, typecheck, tests, build.

Verify:

- A fresh clone works following the README.
- A signed-out user is redirected to sign-in.
- A non-admin can't reach admin pages or call admin actions directly (test the server action, not just the hidden button).
- Switching clients changes the URL and header.

Stop: no imports or metrics yet.

---

### Phase 2 — Imports

**Goal:** an admin uploads any of the three exports, previews it, confirms it, and it becomes that client's active data.

Build:

1. Upload form with client (preselected), source type (auto-detected from headers, overridable) and file. Limits: 10 MB, 50k rows.
2. Pure parsers in `server/importers/` for the three formats in Appendix B. Each returns:
   ```ts
   { rows, totals, warnings, errors, detectedPeriod? }
   ```
   - Unknown or missing required headers → error, not a guess.
   - Unparseable numbers or dates → row-level error, never silently 0.
3. **Period / snapshot metadata.**
   - Meta: read `Reporting starts/ends` from the file.
   - Indeed: suggest dates from the filename (`_YYYYMMDD_YYYYMMDD`), but make the admin confirm them.
   - DriverHub: snapshot date defaults to the newest `App Created` and must be confirmed.
4. Preview screen showing:
   - row count and totals (spend, impressions, clicks, applies, candidate count);
   - warnings and errors;
   - what it will replace.
5. **Confirm** runs in one DB transaction: insert rows, mark this import `active`, mark the previous one `superseded`. Cancel deletes the preview.
6. Duplicate guard: the same sha256 for the same client + source → "already imported".
7. Import history page with **Revert to this import** (admin, audited).
8. **Multi-value cells** (Appendix A.3):
   - keep the raw text;
   - split on tab into a list;
   - add the field to `ambiguous_fields`;
   - show the count in preview.
9. Store the original file privately. Downloading it requires admin.
10. Synthetic fixtures for all three formats, including edge cases: quoted commas, en dashes, zero rows, tab-joined cells, `+1` annotations, same-name candidates, a bad date.

Verify (unit tests on parsers + one Playwright flow):

- If the real files are in `local-data/`, a script `npm run reconcile` prints totals that match Appendix C.
- Re-uploading the same file doesn't double anything.
- A second upload replaces the first; totals don't add together.
- A file with a bad row fails without touching the active data.
- Two candidates with the same name stay two rows.

Stop: no dashboard numbers yet beyond import previews.

---

### Phase 3 — Metrics and first real dashboard  ⟵ **owner demo checkpoint**

**Goal:** select a client, see their real dashboard from uploaded data. Show this to the owner before going further.

Build:

1. `server/reporting/metrics.ts`: pure functions implementing §7. Each returns
   ```ts
   { value: string | number | null, label, definition, period, source, reasonIfNull? }
   ```
2. **Header KPIs** (as in the mockup):
   - total candidates;
   - signed applications;
   - lead → application %;
   - recorded starts;
   - Meta spend;
   - Indeed spend.
   Each shows its source period on hover or in a subtitle.
3. **Source status strip:** for each source, its period or snapshot date, upload date and "not uploaded" if missing.
4. **Recruiting snapshot:**
   - funnel bars;
   - candidates by position;
   - current status breakdown;
   - rejection reasons.
   Every count is clickable. It opens a paginated candidate list filtered to exactly that population.
5. **Meta table:**
   - columns: ad set, location, delivery, period, spend, budget used, impressions, link clicks, CTR, CPC;
   - filter by active/ended;
   - a totals row computed from sums.
6. **Indeed table:**
   - columns: campaign, type, period, impressions, clicks, CTR, apply starts, ASR, applies, completion %, spend, CPA;
   - filter by type;
   - a totals row.
7. Parse the job title and location out of Meta ad-set names (`Client: Title: City, ST`) and Indeed campaign names for display only. If parsing fails, show the raw name.
8. Wayfind styling (brand name from client/agency settings), responsive tables, keyboard accessible, and status not shown by color alone.

Verify:

- Dashboard numbers equal the reconcile script's numbers for the same files.
- Every clickable count opens a list with exactly that many rows.
- A missing Indeed upload shows "not uploaded" while Meta still displays.
- Switching clients mid-load never shows client A's data under client B's name.

Done: the developer walks the owner through one real client. Record his feedback in `docs/decisions.md` **before Phase 4**.

---

### Phase 4 — Insights, account context, and client snapshot

**Goal:** the parts that make this worth more than the exports.

Build:

1. **Channel performance** (§7.4): spend, candidates, signed applications and starts by channel, plus cost per candidate and cost per signed app. Use the per-client referral-source mapping from settings. Include a footnote with the attribution caveat.
2. **Alerts** (§7.5) in an "Urgency signals" panel. Each alert shows:
   - the rule;
   - the numbers behind it;
   - a link to the affected candidates or rows.
   Thresholds are editable per client.
3. **Budgets:** an admin enters a budget per client + source + period. Budget-used bars appear only when the budget period matches the data period; otherwise show "period mismatch".
4. **Account context** (manual, admin-editable):
   - main contact and client contact;
   - service package;
   - links (website, landing page, ATS, Indeed profile, Facebook page; http/https only);
   - next check-in date/time;
   - notes;
   - optional billing fields (plan, amount, bill date, status, "verified on" date).
   Show "Manual — updated by X on date".
5. **Client snapshot export:**
   - a `/c/[slug]/snapshot` print-optimized page;
   - a "Download PDF" button (browser print, or server render via Playwright if needed);
   - hides candidate last names by default, with a toggle to include them.
6. **Data-quality notice** listing ambiguous candidate rows and unmapped referral sources.

Verify:

- Channel math checked by hand on a synthetic fixture.
- Each alert's count equals the length of its drilldown list.
- An alert whose data is missing shows "not enough data", not a false all-clear.
- The PDF renders on one client with real-length data.

---

### Phase 5 — Hardening and pilot deploy

**Goal:** real staff can use it with real data safely.

Build / do:

1. Staging and production environments in **Wayfind-owned** accounts. Secrets go in host env vars only.
2. Security pass:
   - every server action/route checks auth;
   - uploaded text is rendered as text, never HTML;
   - the raw-file bucket is private;
   - no candidate data in logs;
   - dependencies are audited.
3. Audit log viewer (admin).
4. Retention: keep the last N candidate snapshots per client (default 6) and delete older ones with their files. Make N configurable.
5. Backups: confirm what the Supabase plan provides, then run and document one restore test.
6. Error monitoring (e.g. Sentry) with candidate data scrubbed.
7. `docs/operations.md` covering:
   - how to onboard a client;
   - how to do the weekly upload;
   - how to revert a bad import;
   - how to add a user;
   - who to call when something breaks.

Pilot checklist:

- [ ] Owner confirmed branding, users and pilot client
- [ ] Owner approved provisional definitions (§7.3) and retention
- [ ] Real-file totals reconcile with the owner's trusted report, and differences are explained
- [ ] Restore tested
- [ ] Owner ran a real client call off the dashboard

**This is a complete, shippable product even if every live integration is unavailable.**

---

### Phase 6 — Live Meta reporting  *(only if Phase 0 proved access)*

**Goal:** Meta data refreshes automatically, with uploads still working as fallback.

Build:

1. Minimal sync infrastructure:
   - `connections` table (token stored encrypted with a server-only key, or in the host secret store);
   - `sync_runs` table (status, started, finished, error, rows);
   - a protected `/api/cron/sync` route called by host cron;
   - a lock so two runs can't overlap per client.
2. Meta Marketing API Insights per mapped ad account/campaign:
   - fetch daily rows (`time_increment=1`) for spend, impressions, and link clicks taken from `actions`;
   - re-fetch the trailing 7 days each run, replacing them.
   - Reach and frequency don't add across days, so pull them as separate period totals or omit them.
3. Admin mapping screen: discovered ad accounts/campaigns → client. Unmapped entities appear nowhere.
4. Source selection: if live data covers the requested period, use it; otherwise use the upload. **Never add both.**
5. Status strip shows "Live — last synced X" or "Sync failed — showing data from X".
6. With daily data, a spend/clicks-over-time chart becomes allowed for Meta.

Verify:

- Live totals match Ads Manager for the same account, dates and attribution setting; document any differences.
- Re-running the same window doesn't double anything.
- A revoked token shows a "reconnect" state and keeps the last good data.

If blocked: write the code against recorded fixture responses, mark the phase `blocked: <missing permission>` and keep uploads.

---

### Phase 7 — Live Indeed reporting  *(only if Phase 0 proved access)*

Same pattern as Phase 6, using the Sponsored Jobs API reporting endpoints that Wayfind is actually approved for.

- Map employer/campaign IDs to clients.
- Don't replace a complete CSV with a narrower API result.
- Respect quota/cost limits before scheduling.

---

### Phase 8 — DriverHub automation  *(only if the vendor confirmed a supported route)*

1. Implement only the route the vendor confirmed: API, scheduled export, or SFTP drop.
2. Feed the deliveries through the same importer and activation flow as Phase 2.
3. If stable candidate IDs arrive, use them.
4. If status-change dates or contact history arrive, unlock:
   - true "days since last contact" alerts;
   - stage-to-stage conversion over time.
5. Otherwise those stay unavailable. No scraping, no logging in as a user.

---

### Phase 9 — HubSpot and Google Calendar  *(optional)*

1. HubSpot (private app token, read-only): map company ID → client and fill contacts, package and billing fields where those properties actually exist. Synced fields show "from HubSpot"; manual edits are not silently overwritten.
2. Google Calendar (read-only scope): an admin links a calendar and a rule (e.g. an attendee domain or an explicit event pick) per client, and the app shows the next check-in. Handle cancelled, recurring and all-day events and time zones.

---

### Phase 10 — Optional mockup extras

Pick any, independently:

- **Ad previews and Facebook comments:**
  - needs Phase 6 and separately verified Page/creative permissions;
  - read-only;
  - aggregate spend never duplicated across preview cards.
- **Indeed reviews:** manual entry (rating, count, date, source link) unless a supported API is confirmed.
- **Indeed health check and careers-site scorecards:**
  - manual entries against the owner's rubric (from his health-check doc);
  - each score has an assessor and a date;
  - unassessed categories show "not assessed";
  - no overall grade unless he supplies the formula.

---

## 7. Metric definitions

Keep these in `docs/metrics.md` and in `server/reporting/metrics.ts`. Every metric shown in the UI has a one-line definition available on hover.

### 7.1 Meta (from upload or API)

| Metric | Definition |
|---|---|
| Spend | Σ `Amount spent (USD)` |
| Impressions | Σ impressions |
| Link clicks | Σ `Results` **only where** `Result indicator = actions:link_click`; otherwise null with a warning |
| CTR | link clicks ÷ impressions |
| CPC | spend ÷ link clicks (null if 0 clicks) |
| Budget used (per ad set) | spend ÷ ad-set budget, only for `Lifetime` budgets; label it "of lifetime budget" |
| Reach, frequency, unique clicks | Show per row only. **Never sum across ad sets.** |

### 7.2 Indeed

| Metric | Definition |
|---|---|
| Spend, impressions, clicks, apply starts, applies | Σ over all rows (this matches the export total) |
| CTR | Σclicks ÷ Σimpressions |
| Apply start rate | Σstarts ÷ Σclicks |
| Completion rate | Σapplies ÷ Σstarts |
| CPA | Σspend ÷ Σapplies (null if 0) |
| Row type | `organic` if the name is "Jobs not in a campaign"; `plan` if the name starts with "Standard Plan" / "Premium Plan"; `bundle` if job count > 1; else `job`. Shown as a filter; all types are included in totals. |

Never average row-level percentages; always recompute from sums.

### 7.3 Recruiting snapshot (DriverHub export)

These are **provisional labels** until the owner confirms them in Phase 0. Each is a count of candidate rows in the active snapshot.

| Label | Rule |
|---|---|
| Candidates (leads) | All rows. Call them "candidate records" if duplicates are suspected. |
| Signed applications | `App Signed Date` present and valid |
| Interview stage | Status in {`Ready for Interview`, `Connected`} *(confirm with owner)* |
| Onboarding | Status = `Pending Start Date` *(confirm)* |
| Recorded starts (hires) | `Start Date` present and valid. Label "Recorded starts" until the owner confirms that a start date = hire. |
| Rejected / disqualified | `App Status = Rejected`, broken down by `App Rejection Reason` |
| In progress | `App Status = In Progress` |

Rules:

- The funnel is a **current-status snapshot as of the snapshot date**. It is not history. Title it "Status as of {date}".
- A signed application that was later rejected still counts as signed. Status and outcome are separate filters.
- Rows with tab-joined (multi-value) status are counted under "Needs review", not guessed.
- Status-to-stage mapping lives in `client_settings` so it's editable without code.

### 7.4 Channel performance

For each channel (Meta, Indeed, Other/organic):

- **Candidates:** rows whose `App Referral Source` maps to the channel. Default mapping:
  - `Indeed` → Indeed;
  - `Facebook` → Meta;
  - `DriverHub Landing Page` → Meta (editable);
  - everything else → Other.
- **Signed apps** and **recorded starts** for those candidates.
- **Cost per candidate** = channel spend ÷ channel candidates.
- **Cost per signed app** = channel spend ÷ signed apps.

Only compute a cost metric when the ad data period and the candidate snapshot overlap meaningfully. Show both periods next to the number. Caveat shown in the UI: "Based on the referral source recorded in DriverHub. Not ad-level attribution." No cost-per-hire per individual ad or campaign.

### 7.5 Alerts (plain rules, configurable thresholds)

| Rule | Default trigger | Shows |
|---|---|---|
| Stuck in "Attempting Contact" | status = Attempting Contact **and** App Created ≥ 14 days before snapshot date | count + list |
| Unsigned applications | ≥ 50% of in-progress candidates have no signed date | % + list |
| Budget pacing | spend ≥ 90% of a matching-period budget | spend, budget, period |
| Weak Indeed completion | completion rate < 60% with ≥ 10 apply starts | rate + campaigns |
| High cost per candidate | channel cost per candidate > client threshold (unset by default) | channel math |
| Stale data | latest upload for a source older than 10 days | source + date |
| Data needs review | any ambiguous rows or unmapped referral sources | count + list |

Rules for alerts:

- An alert with missing inputs shows "not enough data".
- Never claim *why* something happened, e.g. "candidates took other jobs" or "recruiter is slow".
- "No contact in N days" is **not** available until real contact history exists (Phase 8).

---

## 8. Agent prompts

**Start:**

```text
Read docs/build-plan.md (copy it there if missing). Implement Phase 1 only.
Use the stack in §4. Synthetic data only. Run the Phase 1 checks, record
results in docs/status.md, and stop.
```

**Continue:**

```text
Read docs/build-plan.md, docs/status.md and docs/decisions.md.
Implement Phase N only. Fix earlier-phase bugs that block it, but don't build
later phases. Run the phase's checks, update docs/status.md with actual
results and any blockers, and stop.
```

**Connector without credentials:**

```text
Implement Phase N against recorded fixture responses based on the provider's
current official docs. Don't invent endpoints or claim live success. Keep
upload fallback working. Mark the phase "blocked: <exact missing access>".
```

---

## Appendix A — Data rules (apply in every phase)

**A.1 Replace, don't add.** Each upload is a snapshot of its source for its period. A new upload for the same client + source replaces the active one. Overlapping data is never summed, including upload and API data for the same period.

**A.2 Keep the raw.** Store the original value next to every parsed value. Never coerce a bad number or date to 0. Report it with the row and column.

**A.3 Multi-value cells.**
- DriverHub exports sometimes join values with a tab, sometimes with `+1`, e.g.:
  - `Ready for Interview⇥Attempting Contact`
  - `Rejected⇥+1 Rejected`
  - `Dubuque, IA⇥+1 Dubuque, IA`
- These likely mean one person with multiple applications.
- Keep all values and flag the row. Never silently take the first value, and never split one row into two people.

**A.4 Respect the data's grain.**
- Export rows are totals over a period, not daily data.
- Never spread them across days to draw a trend line.
- Never answer a sub-period question (e.g. "June only") from a longer-period export. Say it's unavailable.
- Trend charts need daily data (live API) or multiple sequential uploads.

**A.5 Snapshot ≠ history.** Today's candidate status says nothing about when a candidate reached it. No stage-to-stage conversion-over-time without dated events.

**A.6 Names aren't IDs.** Don't merge candidates by name. Don't treat campaign names as stable IDs across exports. Use provider IDs when the API supplies them.

**A.7 Missing ≠ zero.** Show "not uploaded", "not enough data" and an actual 0 differently.

**A.8 Periods are visible.** Every number shows (or reveals on hover) its source and period. Meta and Indeed may cover different dates. Show both rather than implying one shared period. Only add spend across sources when the periods match; otherwise show them separately.

**A.9 Safe handling.**
- Uploaded content is rendered as text only.
- Formulas and macros are never executed.
- Archive size is checked before XLSX parsing.
- Candidate data stays out of logs and error messages.

---

## Appendix B — Supported file formats

**Meta ad sets CSV.** Headers:

```text
Reporting starts, Reporting ends, Ad set name, Ad set delivery, Results,
Result indicator, Cost per results, Ad set budget, Ad set budget type,
Amount spent (USD), Impressions, Reach, Frequency, Unique link clicks,
Ends, Starts, Attribution setting, Bid, Bid type, Last significant edit
```

- Dates are `M/D/YYYY`.
- Ad set names look like `CH Wilson Transport: CDL A Local Tanker Driver: Albert Lea, MN`.

**Indeed Jobs Campaigns CSV.** Headers:

```text
Campaign, Premium, Impressions, Clickthrough rate (CTR), Clicks,
Apply start rate (ASR), Apply starts, Apply completion rate (ACR), Applies,
Apply rate (AR), Spend, Cost per click (CPC), Cost per apply start (CPAS),
Cost per apply (CPA), Job Count, Avg clicks per job, Avg apply starts per job,
Avg applies per job, Avg spend per job
```

- No date or currency columns. The period comes from the filename (`Indeed_JobsCampaigns_YYYYMMDD_YYYYMMDD.csv`) and admin confirmation.
- Rates in the file are fractions (0.0234 = 2.34%). Recompute them; don't trust them.

**DriverHub candidates XLSX.** Sheet `Data`. Headers:

```text
App Created, First Name, Last Name, App Recruiting Status, App Referral Source,
Profile Create Date, App Rejection Reason, App Status, Owner operator,
Years Exp., App Signed Date, CDL Exp., Endorsements, Equipment, Start Date,
Position Opening, App Location, App Days in Funnel
```

- Datetimes are text like `06/10/2026 2:02 pm`. Dates are `MM/DD/YYYY`.
- There is no candidate ID column.

---

## Appendix C — Reconciliation values for the sample files

Use these to check the parsers against the real files in `local-data/`. Don't hard-code them.

| File | Check | Expected |
|---|---|---|
| Meta (Apr 1 – Jun 9, 2026) | rows / spend / impressions / link clicks | 6 / $541.71 / 287,377 / 1,728 |
| Indeed (May 4 – Jun 10, 2026) | rows / spend / impressions / clicks / starts / applies | 19 / $2,449.54 / 47,598 / 1,241 / 54 / 42 |
| DriverHub (Jun 10 snapshot) | rows / signed dates / start dates | 48 / 12 / 2 |
| DriverHub | referral sources | Indeed 43, DriverHub Landing Page 2, Facebook 1, Driver/Employee Referral 1, multi-value 1 |
| DriverHub | Attempting Contact | 28 (+1 multi-value row) |

The mockup's headline numbers (47 leads, 11 applications) came from an earlier cutoff. **Don't make the app reproduce them.**

---

## Appendix D — Known open questions (track in `docs/decisions.md`)

1. Who owns the product: Wayfind or AvatarFleet? Which branding?
2. Final funnel stage definitions and what counts as a hire.
3. Which referral sources count as Meta.
4. Is billing needed, and where does it live?
5. Can DriverHub be read automatically, and with contact history?
6. Meta and Indeed API access levels and costs.
7. Retention period for candidate data.
8. Whether clients will ever log in themselves (not in this plan).

---

## 9. Later, not now: AI

Once Phase 5 ships, the reporting functions in `server/reporting/` could be exposed to Claude (e.g. "which clients need attention this week?" or a meeting-prep summary) as a thin layer over the same metrics. That is a separate proposal with its own value to prove. Nothing in Phases 1–10 depends on it.
