# Implementation status

## 2026-10-17 — Phase 3: Metrics and first dashboard

**Implemented and verified with synthetic imports. Real-file reconciliation and the owner demo checkpoint remain pending.**

Built pure Meta, Indeed and recruiting metric functions with definition/source/period/null-reason metadata; six headline KPIs; source status/upload dates; snapshot funnel, position/status/rejection breakdowns; paginated candidate lists for every recruiting count; Meta delivery and Indeed type filters; weighted totals; lifetime-budget utilization; conservative ad-name/location display parsing; keyboard-accessible definitions and responsive tables. Admin-editable interview/onboarding mappings are stored in client settings and audited. Dates, signed outcomes and status ambiguity follow the provisional rules in [metrics.md](metrics.md).

Reporting reads only client-scoped active imports in a repeatable-read transaction. Drilldowns retain the exact snapshot and relevant stage mapping, enforce client ownership, preserve same-name rows and label superseded snapshots. Missing and empty sources remain distinct. The reconciliation script now prints the same reporting calculations alongside parser totals. No Phase 4 features were built.

### How to run

Follow the existing [README](../README.md) setup; no new dependencies or migrations are needed. Start `npm run dev`, sign in, select a client, upload/activate exports in Imports, then open Dashboard. Admins edit stage mappings in Settings. Staff can read dashboard/candidate populations without access to private originals. Test setup uses the documented disposable `TEST_DATABASE_URL` and a production build before Playwright.

### Actual checks

Final `npm run format:check`, `npm run lint`, `npm run typecheck` and `git diff --check` all passed.

| Check                                                 | Result                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `npm ci` using the pinned lockfile and writable cache | Passed                                                              |
| `npm test`                                            | **36 passed** (23 parser + 13 reporting)                            |
| `npm run test:integration` against PostgreSQL 17.11   | **14 passed** (9 import + 5 reporting)                              |
| Production `npm run build`                            | Passed, including TypeScript and candidate/dashboard routes         |
| Production-server Chromium `npm run test:e2e`         | **5 passed** (2 dashboard + 3 existing import journeys)             |
| Desktop 1440px and mobile 375px dashboard screenshots | Inspected; tables scroll within cards, no page overflow             |
| `npm run reconcile`                                   | Exit **2**: no real exports in `local-data/`; Appendix C unverified |

Reporting tests check exact decimal sums, weighted ratios, zero denominators, unsupported Meta results, lifetime-only budgets, all Indeed row types, synthetic parser/dashboard reconciliation, large aggregate counts, signed-then-rejected candidates, ambiguous statuses/dates, configurable stages, and group/list population equality. Database tests cover replacement/revert without historical addition, missing sources, staff read access, denied cross-client/preview/inactive access, deterministic 25-row pagination, historical links and authorized/audited settings merges.

Chromium clicked every recruiting count (including zero counts), checked the declared total against unique original rows across pages, checked ad filters/totals and unchanged headline periods, exercised admin stage settings, focused metric help by keyboard, denied another client's snapshot, checked a Meta-only dashboard with Indeed missing, and observed DOM updates during a delayed client switch for a header/data mismatch. Authentication uses the existing synthetic Supabase HTTP fixture, not a live Supabase account.

The sandbox initially blocked Next.js CSS worker port binding and the tsx IPC socket. Re-running with local networking allowed and a fresh generated Next cache completed the build and checks without changing app configuration. CI configuration includes the new suites; remote CI was not run and no deployment was performed.

### Remaining inputs and owners

- **Owner/developer:** provide the pilot client's real exports and trusted report, confirm upload metadata, reconcile the same files/periods and walk the owner through the dashboard. Record actual feedback in `docs/decisions.md` before Phase 4. No owner feedback or real-data success is claimed.
- **Wayfind/developer:** complete the existing live Supabase Auth/private Storage setup and verification from Phase 2. Synthetic browser auth does not establish live connectivity.
- **Owner/developer:** confirm provisional funnel/branding definitions and the remaining Phase 0 decisions. The referenced HTML prototype is still absent; the implemented design follows the existing Wayfind app shell and required sections.

Stop at Phase 3; the owner demo checkpoint is pending external inputs.

## 2026-10-17 — Phase 2: Imports

**Built and locally verified with synthetic data. Live setup and real-file reconciliation remain unverified.**

The repository started with only `Wayfind_Command_Center_Build_Plan_v2.md`. Added the missing app foundation needed for Phase 2: Next.js/TypeScript/Tailwind, Drizzle and PostgreSQL migrations/RLS, Supabase invite-only sign-in and server authorization, first-admin script, admin client management/user invitations, client switcher, and empty dashboard. The plan is copied to `docs/build-plan.md`.

Implemented all three pure import parsers, automatic source detection with override, 10 MiB/50k-row limits, required-header/date/number validation, exact decimal totals, raw-value preservation, candidate multi-value lists and ambiguity counts, explicit period/snapshot confirmation, previews, cancellation, private originals/admin downloads, SHA-256 duplicate protection, transactionally activated replacements, history, and audited revert. SQL locks and a partial unique index protect concurrent confirmations. Failed files never change active data. Dashboard numbers and later phases were not implemented.

### How to run

Follow [README.md](../README.md): `npm ci`, copy/configure `.env.example`, `docker compose up -d db`, `npm run db:migrate`, `npm run db:seed`, `npm run create-admin -- your-email@example.com`, and `npm run dev`. Configure invite-only Supabase Auth and its callback/template first. Add the pilot client through Manage clients, then open its Imports page. Private disk storage works locally; hosted Supabase storage requires a private bucket and service key.

### Actual checks

| Check                                                           | Result                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| Dependency installation with pinned versions/lockfile           | Passed                                                          |
| Migration and synthetic seed, each run twice                    | Passed; repeatable                                              |
| Typecheck from a fresh source copy without generated Next files | Passed                                                          |
| `npm run format:check`                                          | Passed                                                          |
| `npm run lint`                                                  | Passed, no warnings                                             |
| `npm run typecheck`                                             | Passed                                                          |
| `npm test`                                                      | **23 passed**                                                   |
| PostgreSQL 17.11 `npm run test:integration`                     | **9 passed**                                                    |
| `npm run build`                                                 | Passed                                                          |
| Production-server Chromium `npm run test:e2e`                   | **3 passed**                                                    |
| Desktop and 375px mobile import preview                         | Inspected screenshots; no horizontal page overflow              |
| `npm run reconcile`                                             | Exit 2: no real files in `local-data/`; Appendix C not verified |

Parser tests cover quoted commas/en dashes, exact money and very large counts, unknown/missing/duplicate headers, invalid dates/numbers, unsupported result indicators, all Indeed row kinds, filename period suggestions, same-name candidates, tab/+1 cells, formula rejection, zero-row exports, 10 MiB/50k-row limits, and inflated archive bounds.

PostgreSQL tests cover duplicate rejection, replacement without addition, audited revert, invalid-file isolation, mandatory metadata, ambiguous candidate persistence, concurrent/stale confirmations, rollback after an injected DB failure, original-byte downloads/integrity checks, cancellation/file deletion, client scoping, inactive/staff denial of every service operation, and deny-all RLS using a non-owner database role.

Browser checks cover the complete Meta preview/confirm/duplicate/replace/bad-date/cancel/revert/download journey, Indeed and DriverHub metadata confirmation, signed-out redirects, staff download denial, a direct replay of an admin upload server action as staff, and switching to another client's empty history. Authentication uses a local Supabase HTTP fixture through the real auth SDK; this is **not a live Supabase validation**. No production test-auth bypass exists.

### Remaining setup and owners

- **Wayfind/developer:** provide/configure Supabase Auth credentials, disable signup, configure email callbacks/templates, bootstrap an actual admin, and verify a real sign-in. Invitations were implemented but no actual email was sent during this work.
- **Wayfind/developer:** create/configure a private Supabase Storage bucket and verify a live original-file upload/download before hosting. Disk storage was tested locally.
- **Owner/developer:** put the three real sample exports in git-ignored `local-data/`, run `npm run reconcile`, and compare its printed aggregates with Appendix C and the trusted report. No real exports or trusted report were available.
- **Owner/developer:** complete Phase 0 decisions/access checks in `docs/decisions.md` and `docs/access.md`. No vendor API integration was claimed.
- If private file deletion fails after preview cancellation commits, the file may remain as a private orphan requiring operator cleanup. Storage and PostgreSQL cannot commit together. No active data is affected.

CI is configured for the same checks using synthetic data; remote CI has not been run. No deployment was performed. Stop at Phase 2.
