# Implementation status

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
