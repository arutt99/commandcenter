# Wayfind Command Center

Phase 2: private, admin-only import previews for Meta CSV, Indeed CSV, and DriverHub XLSX. Confirmation replaces the active source snapshot; history supports audited revert. Dashboard metrics start in Phase 3.

The input repository contained only the build plan. This implementation includes the Next.js, PostgreSQL, Supabase Auth, client management, and empty dashboard foundation needed to run imports. See [docs/status.md](docs/status.md) for actual verification and remaining external setup.

## Local setup (Windows / PowerShell)

Install Node.js 22+ and Docker Desktop. Use a Supabase development project owned by Wayfind (or local Supabase).

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d db
```

Edit `.env` with the project's Supabase URL, anon key and service role key. Keep the service role key server-only. The example PostgreSQL connection matches Compose.

Configure Supabase Auth:

1. Disable **Allow new users to sign up**. There is no public signup in the app, and only active entries in `users` can access it.
2. Set the site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback` as a redirect URL.
3. For invitations, use this template link: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`. The callback verifies it server-side and writes session cookies. Email sign-in links use PKCE.
4. Use email links to sign in after accepting an invitation, or set a password through your Supabase account administration. There is no public password/signup flow.

```powershell
npm run db:migrate
npm run db:seed
npm run create-admin -- your-email@example.com
npm run dev
```

Open [localhost:3000](http://localhost:3000). The seed creates **Example Freight** and **Sample Transport**; both are synthetic. An admin can use **Manage clients** to add the real pilot client or edit branding/timezone. Client selection is kept in the URL. Use Manage clients to invite additional users as staff or administrators. Only admins can access imports and raw files; staff can access the client list and empty dashboard.

On macOS/Linux, use `cp .env.example .env` instead of `Copy-Item`. The remaining setup commands are the same. The create-admin command sends an actual invitation when run with live credentials; no real invitation was sent during implementation.

## Weekly import workflow

1. Select the client and open **Imports**. Choose the file and leave source detection on, or override it. Supported headers are in [docs/build-plan.md](docs/build-plan.md), Appendix B.
2. Review totals, validation errors, warnings, ambiguous-cell counts, and the dataset being replaced.
3. Confirm dates. Meta dates come from the file. Indeed filename dates and DriverHub's newest creation date are suggestions that must be explicitly confirmed. Empty files require dates entered manually.
4. Activate. Only a valid preview can activate. A different active import since preview requires a reload and review.
5. Review history to download an original or revert a superseded import. Cancel deletes a preview and its private file. A failed preview can be cancelled before retrying an identical file.

Same-file duplicates are detected by SHA-256 for each client/source, including renamed files. Historical data is retained, but queries must select `imports.status = 'active'`; never sum history with active data. Candidates are individual rows, even when names match.

Limits: 10 MiB, 50,000 rows, 100 MiB actual/declared inflated XLSX contents, 2,000 ZIP entries. XLSX requires the `Data` sheet and plain values. Macros, external workbook links, formulas, rich-text/hyperlink/error cells are rejected. Nothing is evaluated. Errors identify rows and columns without copying candidate data.

## Private originals

Local development stores originals in `private-storage/` outside public assets, under random keys with restricted filesystem permissions. Do not place this directory under `public/` or expose it through another web server.

For hosting, set `FILE_STORAGE=supabase`, create a **private** bucket named `import-originals`, and set `SUPABASE_STORAGE_BUCKET` if using a different name. Keep browser storage policies deny-all. The server verifies that the bucket is private before reads/uploads and streams downloads only after admin authorization. Vercel cannot use disk storage. Other hosts may use disk only with a private persistent volume. Live Supabase storage has not been verified in this environment.

Run versioned SQL migrations using `npm run db:migrate`. The server DB connection must own the tables or use a dedicated BYPASSRLS role. Every application table and migration bookkeeping table has RLS with **no policies**, denying access to ordinary browser database roles. Do not use the anon key as the server database credential.

## Checks

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Database and browser tests need a disposable database whose name ends in `_test`. They truncate its application tables. Never point them at a real-data database.

```powershell
docker compose exec db createdb -U wayfind wayfind_test
$env:TEST_DATABASE_URL = "postgresql://wayfind:wayfind@localhost:5432/wayfind_test"
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

On macOS/Linux use `export TEST_DATABASE_URL=postgresql://wayfind:wayfind@localhost:5432/wayfind_test`. Browser tests use a local synthetic Supabase HTTP fixture, real Next.js production server, and real PostgreSQL. Production auth has no test bypass. They verify all three upload formats, preview/confirmation/replacement/duplicate rejection/bad-row rejection/revert/download, sign-out and staff restrictions, and client switching. Run them after `npm run build`. A system Chromium is used when available, or set `CHROMIUM_PATH`.

Synthetic fixtures are committed; regenerate them with `npm run fixtures`. Put real exports in git-ignored `local-data/` and run `npm run reconcile`. This prints aggregate totals and date metadata without candidate names or raw rows. Compare with Appendix C only for the sample client/period documented there. No files returns exit code 2 (not verified); parse errors return 1. Never commit real exports.

CI runs format, lint, typecheck, parser tests, PostgreSQL integration tests, production build, and Playwright with synthetic data. Live vendor connections and dashboard calculations are outside Phase 2.
