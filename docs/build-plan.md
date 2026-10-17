# Wayfind Command Center — local build plan

Version 3.0 · October 17, 2026 · Single owner, one computer

This is the active numbered roadmap. It replaces the hosted architecture in the [original v2 plan](../Wayfind_Command_Center_Build_Plan_v2.md). [local-app-plan.md](local-app-plan.md) records the approved operating model; [status.md](status.md) records actual implementation and verification. Metric definitions and file formats remain below so future phases use the same data rules.

## 1. How to use this plan

Implement one requested phase at a time. Do not rebuild completed work or implement optional integrations without the required provider access. Make routine technical decisions and record them in `docs/decisions.md`. Synthetic data only in Git; real exports stay in git-ignored `local-data/`. Keep the app runnable. Test consequential math, imports, local access boundaries and data recovery; record actual checks and blockers in `docs/status.md`.

No dashboard sign-in, staff invitations, user roles, client portal, cloud database, hosting setup or host cron is part of this direction. The owner's operating-system account protects access to the computer. Future source connections still require the source provider's authorization. No AI/chat/MCP features, scraping or writes to outside systems are in scope.

## 2. Product and progress

For each client, show advertising spend, recruiting status, productive channels, items needing attention and client-call context. The first complete product uses uploaded Meta/Indeed CSVs and DriverHub XLSX snapshots. The owner can share a printed/PDF client snapshot without granting anyone app access.

| Phase            | Status                                                             | Outcome                                                                                |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 0                | Owner/developer input checks remain open; not a coding phase       | Real exports, trusted report, metric decisions and provider access evidence.           |
| 1                | Foundation built; converted to local single-owner operation        | Local launch, clients, private local database/originals and local request boundaries.  |
| 2                | Built and verified with synthetic files                            | Preview, validate, confirm, replace, revert and download imports.                      |
| 3                | Built and verified with synthetic files; actual owner demo pending | Reporting dashboard and exact candidate drilldowns.                                    |
| Local conversion | Built and verified on Linux; target-machine smoke test pending     | No login, SQLite, launchers, backups/restore and one-instance protection.              |
| 4                | Next core phase, after actual demo feedback                        | Channel performance, alerts, account context and client snapshot export.               |
| 5                | Remaining core phase; local backup foundation already built        | Owner-machine hardening, retention, update/recovery instructions and pilot acceptance. |
| 6                | Optional, access-dependent                                         | Automatic Meta reporting.                                                              |
| 7                | Optional, access-dependent                                         | Automatic Indeed reporting.                                                            |
| 8                | Optional, vendor-dependent                                         | Supported DriverHub automation.                                                        |
| 9                | Optional                                                           | HubSpot and Calendar convenience connections.                                          |
| 10               | Optional, choose individual extras                                 | Ad previews/comments, reviews and owner-defined scorecards.                            |

**Two core coding phases remain: 4 and 5.** There are five optional later phases, 6–10. If the owner wants automatic Meta, Indeed and DriverHub reporting too, that adds phases 6, 7 and 8, subject to access. The owner can use the existing dashboard for a pilot/demo after local setup; it is not yet signed off against real reports.

## 3. Phase 0 — Remaining discovery and access evidence

This is owner/developer work alongside development, not an extra application build:

- Supply the pilot client's three real exports, one trusted report and any missing hiring/health-check rubrics. Reconcile the same source periods and snapshot; do not copy mockup headline numbers.
- Confirm branding, provisional funnel definitions, referral-source mapping, meaningful period overlap for channel cost, optional billing and candidate retention (default proposal: latest six candidate snapshots per client).
- Confirm the owner's OS and external backup location. Test the actual launcher and restore on that computer during Phase 5.
- Prove approved Meta read access, Indeed agency/employer reporting eligibility, and a vendor-supported DriverHub API/scheduled export/file delivery before their optional phases. Confirm HubSpot/Calendar fields and access only if those features are wanted.
- Record each source state in `docs/access.md`: `live_possible`, `upload_only`, `manual`, `unavailable` or `unknown`. Record real owner answers and feedback in `docs/decisions.md`.

The single-owner/local-access decision is settled. No hosting, Supabase auth or staff-access discovery is needed.

## 4. Current architecture

| Concern               | Choice                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interface and server  | Next.js App Router + TypeScript, opened locally in the browser.                                                                                                          |
| Launch                | `Start Wayfind.cmd`, `Start Wayfind.command`, or `npm start`; Node 22.12+, Node 24 recommended. Build checks detect outdated code/dependencies/Node major.               |
| Network boundary      | Bind to `127.0.0.1` only; enforce local host/port, same origin and browser request-context checks. No remote-access option.                                              |
| App access            | No accounts, login, invitations or roles. `requireLocal()` protects server entry points. `local-owner` is audit provenance, not a hidden account.                        |
| Database              | Embedded SQLite through the file-only libSQL driver and Drizzle, with migrations and foreign keys. No external database or Turso account.                                |
| Transactions          | Serialize local transactions and backups; keep import activation atomic and enforce one active import per client/source.                                                 |
| File storage          | Private OS application-data folder containing database and original uploads, separate from source/build files.                                                           |
| Numbers               | Exact decimal text in SQLite; decimal.js for money/ratios. Never floats for stored monetary values.                                                                      |
| Parsing and reporting | Existing pure parsers and reporting functions; Papa Parse and ExcelJS values-only parsing with archive checks.                                                           |
| UI                    | Existing Wayfind shell, semantic responsive tables, keyboard-accessible controls/definitions.                                                                            |
| Verification          | Vitest logic/real SQLite tests and Playwright against the production local launcher. Synthetic data only.                                                                |
| Backups               | Verified SQLite snapshot plus every referenced original; manual and daily automatic copies, seven automatic copies retained, offline staged restore preserving old data. |
| Future scheduling     | Local jobs while app/computer are awake, with status and manual refresh. No hosted cron endpoint.                                                                        |
| Future credentials    | Provider-approved flows and OS credential vault; no tokens in HTML/browser storage, source code or plain database fields.                                                |

A single-instance filesystem lock belongs to the actual serving process. Maintenance commands respect it. SQLite/original data and backups are not encrypted by the app; document local-account protection and external copies. Do not expose this app using tunnels, port forwarding or public hosting.

## 5. Data model and invariants

Existing local tables are `clients`, `client_settings`, `imports`, `meta_rows`, `indeed_rows`, `candidate_rows`, `audit_log` and migration bookkeeping. JSON values are encoded as text; IDs are generated locally. Audit/upload actor columns retain the fixed local-owner provenance label. There is no `users` table.

Add `client_context` and `budgets` in Phase 4, and connection/sync metadata only in the relevant optional phase. Keep provider credentials in the OS vault, with references in connection metadata.

There is one active dataset per client/source. Replacement, overlapping imports and future live/upload data are never added together. Preserve raw values and original files. Names are not IDs. Candidate rows with ambiguous fields remain single rows and show Needs review. Missing data is distinct from zero, dates stay visible, and snapshots do not imply dated stage history. Full rules and formats are in §7 and Appendices A–C.

## 6. Phases

### Phases 1–3 and local conversion — built

Do not recreate the foundation, import system or reporting dashboard. Use `docs/status.md` for the actual checks and remaining limits. Backups/restore, local paths, launchers, local access checks and a single-instance lock were brought forward and implemented during the local conversion.

**Checkpoint before Phase 4:** the developer walks the owner through a real pilot client's dashboard, reconciles the same files against the trusted report and records actual feedback in `docs/decisions.md`. This is pending; synthetic tests are not owner acceptance.

### Phase 4 — Insights, account context and client snapshot

**Goal:** make client-call preparation more useful than reading exports.

Build:

1. Channel performance (§7.4): spend, candidate/signed/start counts and eligible cost metrics using per-client referral-source mapping. Show both source periods and the attribution caveat. Do not imply per-ad applicant attribution or invent overlap decisions.
2. Urgency signals (§7.5): configurable thresholds, rule and supporting numbers, plus exact drilldowns. Missing inputs show Not enough data. No causal guesses or days-since-contact claims without real contact history.
3. Manual budgets by client/source/period; utilization only when budget and data periods match. Preserve Phase 3's separate per-ad-set lifetime-budget metric.
4. Local owner-editable account context: contacts, package, validated http/https links, next check-in, notes and optional billing with verification date. Label manual data with its last-updated date; no staff permissions or invitations.
5. Print-optimized `/c/[slug]/snapshot` and browser print/PDF. Hide candidate last names by default, with an explicit include toggle.
6. Data-quality notice for ambiguous candidate rows and unmapped referral sources, with useful drilldowns.

Verify channel math by hand on synthetic fixtures; every alert/count agrees with its population; missing inputs remain unknown; PDF/print works with realistic-length data. Reconcile the pilot client's actual data when supplied. Record results, limitations and owner feedback; stop.

### Phase 5 — Local hardening and owner pilot

**Goal:** the owner can use and recover the app on his actual machine with real data.

Already built during local conversion: private local SQLite/originals, loopback and origin checks, single-instance locking, build freshness, manual/daily backups and checksum-validated offline restore. Retain them and fix issues found by the actual-machine pilot; do not rebuild a cloud backup/auth/hosting system.

Remaining work:

1. Test the launcher, default browser, startup/shutdown, offline use and reopening persistent data on the owner's actual OS. Verify updates retain data. A standalone executable installer is optional future work, not a new prerequisite.
2. Review local request/action/download boundaries, raw-text rendering, filesystem access, logging and dependencies. Keep candidate data and provider secrets out of logs. Use scrubbed local diagnostics/support instructions; no cloud error-monitoring account is required.
3. Add a local audit-history viewer.
4. Implement configurable candidate-snapshot retention (default proposal six, subject to owner confirmation). Delete database rows and corresponding private files safely, preserve active data and verify backup/restore compatibility.
5. Verify a complete backup on a separate device and restore it on the owner's machine, including totals and original downloads. Existing synthetic restore tests are completed evidence, not this acceptance test.
6. Write `docs/operations.md`: initial setup, adding a client, weekly uploads, reverting a bad import, backups/external copies, restore, updates, retention, shutdown and troubleshooting/support. No adding-users procedure.

Pilot checklist:

- [ ] Owner confirmed branding, pilot client, provisional definitions and retention.
- [ ] Actual-machine launcher/browser/offline/persistence/update checks passed.
- [ ] Real-file totals match the trusted report, with differences explained.
- [ ] External backup copy and restore on the owner's machine verified.
- [ ] Owner ran a real client call using the dashboard and approved remaining issues.

**This completes the upload-based local product.** No cloud hosting, app login or automatic vendor access is needed for that milestone.

### Phase 6 — Automatic Meta reporting (optional; proven access required)

1. Add local connection metadata, `sync_runs`, single-run locking and a manual Refresh control. Store tokens in the OS credential vault. Give any provider-supported local authorization callback a narrowly validated state/PKCE flow; do not disable origin protections for unrelated routes/actions.
2. Schedule refreshes only while the app/computer are running. On waking/reopening, refresh the appropriate trailing window without inventing missed activity. Show last success, failure and reconnect states. Do not add host cron or public endpoints.
3. Fetch approved daily Insights for mapped client accounts/campaigns, replace the trailing seven days and retain period totals separately where reach/frequency require it.
4. Use a complete matching live dataset or the upload fallback; never sum both. Unmapped accounts/campaigns do not appear under a client.
5. Daily trend charts become allowed only with real daily data. Keep uploaded reports usable when credentials expire or access fails.

Verify against Ads Manager for the same dates/settings; repeated refreshes do not duplicate totals; revoked access preserves the last good data. Fixture-only adapters remain labelled built, not connected. If access is not proven, defer the phase and record the missing permission.

### Phase 7 — Automatic Indeed reporting (optional; proven access required)

Follow Phase 6's local scheduling, vault, status and fallback pattern using only the reporting access Indeed approved for the owner. Map employer/campaign IDs to clients, respect cost/quota limits, and do not replace a complete CSV with narrower API coverage. Reconcile live totals and verify repeat-refresh/revocation behavior. No access means defer with an explicit blocker.

### Phase 8 — DriverHub automation (optional; supported route required)

Implement only the vendor-confirmed API, scheduled export or supported file delivery. Deliveries enter the existing parser/activation path and remain client-scoped. There is no public receiving server assumed; choose a supported local retrieval/delivery method and document when the machine must be on. No scraping or reverse engineering.

Use stable IDs if supplied. Unlock contact-age alerts or historical stage conversions only if actual contact/status-change events are present. Test duplicate/retry/invalid delivery handling and original-file recovery. If no supported route exists, keep uploads.

### Phase 9 — HubSpot and Google Calendar (optional convenience)

Add only connections the owner wants. HubSpot may fill verified company contacts/package/billing fields; show the source and do not silently overwrite manual edits. Calendar may fill the next check-in using an explicit client mapping; handle cancelled/recurring/all-day events and timezones. Use read-only permissions, OS-vault credentials and local refresh behavior. No dashboard user accounts are needed.

### Phase 10 — Optional mockup extras

Choose each independently:

- Read-only Meta ad previews/comments only after Phase 6 and separately proven permissions; never duplicate spend across cards.
- Manual Indeed review rating/count/date/source link unless supported API access is confirmed.
- Manual Indeed health-check/careers-site scorecards only with the owner's rubric, assessor/date and any supplied overall-score formula. Unassessed items stay Not assessed.

---

## 7. Metric definitions

Keep these in `docs/metrics.md` and in `server/reporting/metrics.ts`. Every metric shown in the UI has a one-line definition available on hover.

### 7.1 Meta (from upload or API)

| Metric                          | Definition                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Spend                           | Σ `Amount spent (USD)`                                                                            |
| Impressions                     | Σ impressions                                                                                     |
| Link clicks                     | Σ `Results` **only where** `Result indicator = actions:link_click`; otherwise null with a warning |
| CTR                             | link clicks ÷ impressions                                                                         |
| CPC                             | spend ÷ link clicks (null if 0 clicks)                                                            |
| Budget used (per ad set)        | spend ÷ ad-set budget, only for `Lifetime` budgets; label it "of lifetime budget"                 |
| Reach, frequency, unique clicks | Show per row only. **Never sum across ad sets.**                                                  |

### 7.2 Indeed

| Metric                                            | Definition                                                                                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spend, impressions, clicks, apply starts, applies | Σ over all rows (this matches the export total)                                                                                                                                                                 |
| CTR                                               | Σclicks ÷ Σimpressions                                                                                                                                                                                          |
| Apply start rate                                  | Σstarts ÷ Σclicks                                                                                                                                                                                               |
| Completion rate                                   | Σapplies ÷ Σstarts                                                                                                                                                                                              |
| CPA                                               | Σspend ÷ Σapplies (null if 0)                                                                                                                                                                                   |
| Row type                                          | `organic` if the name is "Jobs not in a campaign"; `plan` if the name starts with "Standard Plan" / "Premium Plan"; `bundle` if job count > 1; else `job`. Shown as a filter; all types are included in totals. |

Never average row-level percentages; always recompute from sums.

### 7.3 Recruiting snapshot (DriverHub export)

These are **provisional labels** until the owner confirms them in Phase 0. Each is a count of candidate rows in the active snapshot.

| Label                   | Rule                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Candidates (leads)      | All rows. Call them "candidate records" if duplicates are suspected.                                       |
| Signed applications     | `App Signed Date` present and valid                                                                        |
| Interview stage         | Status in {`Ready for Interview`, `Connected`} _(confirm with owner)_                                      |
| Onboarding              | Status = `Pending Start Date` _(confirm)_                                                                  |
| Recorded starts (hires) | `Start Date` present and valid. Label "Recorded starts" until the owner confirms that a start date = hire. |
| Rejected / disqualified | `App Status = Rejected`, broken down by `App Rejection Reason`                                             |
| In progress             | `App Status = In Progress`                                                                                 |

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

| Rule                          | Default trigger                                                                | Shows                 |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| Stuck in "Attempting Contact" | status = Attempting Contact **and** App Created ≥ 14 days before snapshot date | count + list          |
| Unsigned applications         | ≥ 50% of in-progress candidates have no signed date                            | % + list              |
| Budget pacing                 | spend ≥ 90% of a matching-period budget                                        | spend, budget, period |
| Weak Indeed completion        | completion rate < 60% with ≥ 10 apply starts                                   | rate + campaigns      |
| High cost per candidate       | channel cost per candidate > client threshold (unset by default)               | channel math          |
| Stale data                    | latest upload for a source older than 10 days                                  | source + date         |
| Data needs review             | any ambiguous rows or unmapped referral sources                                | count + list          |

Rules for alerts:

- An alert with missing inputs shows "not enough data".
- Never claim _why_ something happened, e.g. "candidates took other jobs" or "recruiter is slow".
- "No contact in N days" is **not** available until real contact history exists (Phase 8).

---

## 8. Agent prompts

Read `docs/build-plan.md`, `docs/local-app-plan.md`, `docs/status.md` and `docs/decisions.md`. Implement the requested phase only. Use the current local architecture, synthetic fixtures and the existing import/reporting lifecycle. Fix blocking earlier-phase bugs without rebuilding completed work. Run relevant checks, record actual results and blockers in status, and stop.

Before Phase 4, record the owner's actual Phase 3 demo feedback. If feedback or provider access is missing, report that specific missing input; never invent approval, credentials or a successful live test. A fixture-tested adapter is built, not connected.

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

- No date or currency columns. The period comes from the filename (`Indeed_JobsCampaigns_YYYYMMDD_YYYYMMDD.csv`) and owner confirmation.
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

| File                          | Check                                                  | Expected                                                                                   |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Meta (Apr 1 – Jun 9, 2026)    | rows / spend / impressions / link clicks               | 6 / $541.71 / 287,377 / 1,728                                                              |
| Indeed (May 4 – Jun 10, 2026) | rows / spend / impressions / clicks / starts / applies | 19 / $2,449.54 / 47,598 / 1,241 / 54 / 42                                                  |
| DriverHub (Jun 10 snapshot)   | rows / signed dates / start dates                      | 48 / 12 / 2                                                                                |
| DriverHub                     | referral sources                                       | Indeed 43, DriverHub Landing Page 2, Facebook 1, Driver/Employee Referral 1, multi-value 1 |
| DriverHub                     | Attempting Contact                                     | 28 (+1 multi-value row)                                                                    |

The mockup's headline numbers (47 leads, 11 applications) came from an earlier cutoff. **Don't make the app reproduce them.**

---

## Appendix D — Remaining owner decisions

1. Final branding: Wayfind or the owner's agency brand.
2. Final funnel definitions and whether a recorded start counts as a hire.
3. Referral-source mapping and meaningful period overlap for channel cost metrics.
4. Whether billing fields are needed and where the information comes from.
5. Supported DriverHub automation, stable IDs and contact history.
6. Meta/Indeed provider eligibility, permissions, quotas and costs.
7. Candidate retention period and external backup destination.
8. Target operating system and pilot client/trusted report for the local-machine acceptance test.

Single-owner access and local operation are already decided. No staff accounts or client portal are planned.

---

## 9. Later, not now: AI

Once Phase 5 ships, the reporting functions in `server/reporting/` could be exposed to Claude (e.g. "which clients need attention this week?" or a meeting-prep summary) as a thin layer over the same metrics. That is a separate proposal with its own value to prove. Nothing in Phases 1–10 depends on it.
