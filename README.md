# Wayfind Command Center — local edition

A private reporting app for one owner, running on his own computer. Open it from a shortcut, choose a client, upload Meta/Indeed/DriverHub exports, and view the dashboard. There is **no dashboard account, sign-in, password, invitation, Supabase project, Docker installation or database server** to set up.

The browser is the screen; a small local program handles files and reporting. Everything is stored on this machine. This is not a standalone HTML file or a hosted service. Automatic vendor connections remain future work; their provider permissions will still be required.

## One-time setup

Your setup helper needs Node.js **22.12 or newer** (Node 24 LTS recommended) and a copy of this repository on the owner's machine. Install the app and build it from the app folder:

```powershell
npm run setup
```

Internet access is needed for the initial dependency installation. Normal upload/reporting use works offline afterward. No `.env` file is required.

**Windows:** double-click `Start Wayfind.cmd`. Create a desktop shortcut to that file if desired. **macOS:** double-click `Start Wayfind.command`; the helper may need to mark it executable with `chmod +x "Start Wayfind.command"`. **Linux:** run `./Start\ Wayfind.command`, or use the command below on any platform:

```powershell
npm start
```

The launcher opens [127.0.0.1:4310](http://127.0.0.1:4310) in the default browser. Keep the terminal window open while using the app. Press Ctrl+C in that window to stop it; closing the browser tab alone does not stop the app. Use `npm start -- --no-open` to start without opening a browser.

The launcher creates and migrates the local database automatically and checks for outdated builds. The shortcut rebuilds when app code or the Node major version changes. After an update, close the running app and run `npm run setup` before reopening it. Start with **Manage clients → Add a client**. No real or demo clients are inserted automatically. `npm run db:seed` optionally adds two clearly synthetic clients for a demo.

## Where the data lives

| System  | Default data folder                                                                 |
| ------- | ----------------------------------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\Wayfind Command Center`                                             |
| macOS   | `~/Library/Application Support/Wayfind Command Center`                              |
| Linux   | `$XDG_DATA_HOME/wayfind-command-center`, or `~/.local/share/wayfind-command-center` |

The **Local data & backups** page shows the actual folder on his machine. Inside it, `store/command-center.sqlite` holds clients, settings, parsed reports and audit history; `store/originals/` holds original uploads. Money is stored as exact text and calculated with decimal.js. Data is separate from the app source, so replacing/updating the app does not replace the data.

Protect this data with the computer's user account, screen lock and disk encryption as appropriate. The app does not encrypt the database or backup folders itself. Keep the data folder on a local disk; do not run it directly from a network share or a cloud-synced folder.

Optional settings can be put in `.env` (copy `.env.example`):

```dotenv
# Optional custom private data folder. Use an absolute path.
# WAYFIND_DATA_DIR=C:/Users/YourName/WayfindData
WAYFIND_PORT=4310
```

No vendor credentials are needed for uploads. Legacy `DATABASE_URL`, Supabase and file-storage settings are unused.

## Weekly reporting

1. Add/select a client, then open **Imports**.
2. Upload the client's Meta CSV, Indeed CSV or DriverHub XLSX. Source detection can be overridden.
3. Review totals, warnings, ambiguous fields and the active report being replaced. Confirm reporting dates or the candidate snapshot date.
4. Activate, then open **Dashboard**. Uploads replace the active snapshot for that source; historical data is never added to the current totals.
5. Click any recruiting count to open its exact candidate population, with 25 records per page. Same-name records remain separate. Links retain the snapshot and stage mapping even if new data is uploaded later.

Meta and Indeed report periods are shown separately. Missing uploads say **Not uploaded**; a valid empty upload has zero counts/spend. Filters recompute selected table totals, while headline spend uses the complete active import. Definitions are available on focus/hover or KPI details. Edit interview/onboarding statuses in client **Settings**; provisional definitions are documented in [docs/metrics.md](docs/metrics.md).

Import history supports downloading originals, reverting confirmed imports, and deleting previews. Upload limits remain 10 MiB/50,000 rows; XLSX must have the `Data` sheet and plain values. Formulas, macros, external links and excessive archive expansion are rejected. No candidate data is intentionally logged.

## Backup and restore

Open **Local data & backups → Create backup now** before important changes. A backup is a folder containing a consistent database snapshot, all originals referenced by that snapshot, and a checksum manifest. The app also creates daily automatic backups on startup and checks hourly while running; it retains seven automatic backups. Manual and pre-restore backups are kept until you remove them.

**Copy complete backup folders to an external drive or another safe location.** Keeping backups on the same computer does not protect against losing that computer. Backups contain private candidate data.

To make a backup from the command line, close the app first:

```powershell
npm run backup
```

To restore, close the app's terminal window and have the helper run:

```powershell
npm run restore -- "full path to the saved backup folder" --confirm
npm start
```

The restore validates the database, every original and their checksums before touching the current store. It stages and rechecks copied files, preserves the current store in `.previous-*`, and attempts a separate pre-restore backup. Recovery can still proceed if the current database is corrupt. Do not delete `.previous-*` directories until you are satisfied with the restored result. The instance lock prevents a restore while the app is running; after an unexpected shutdown, stale-lock recovery may take up to two minutes.

## Local access and future connections

The launcher binds to **127.0.0.1 only**. Host, origin and browser request-context checks reject external hosts and cross-origin requests; frames are denied. The serving process owns the data-folder lock. There are no user accounts, roles, invitations or cloud auth bypasses. Do not expose the app using port forwarding, tunnels or a public host. Other programs running as the same computer user already have equivalent access to these files.

The pure importers/reporting code remains separate from storage and screens. Future Meta/Indeed/DriverHub deliveries can use the same preview/activation rules and one-active-import model. Future refresh jobs will run locally while the app and computer are on. Provider approvals are still unverified; OAuth/API credentials should use the OS credential vault when those integrations are implemented, not browser storage or an HTML file. No automatic source connection or token store is claimed by this change.

The user-approved direction is recorded in [docs/local-app-plan.md](docs/local-app-plan.md); it supersedes the hosted/auth/database choices in the original build plan. For an existing hosted/PostgreSQL installation, keep its backups and originals: **this release does not automatically convert that database**. Recreate client settings and re-upload the original exports into the local app before retiring a hosted copy.

## Development and checks

```powershell
npm ci
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Integration tests create temporary SQLite stores and clean them up. Browser tests run the real production launcher on port 4311 with a dedicated synthetic store under `test-results/local-e2e`; they need no credentials, auth fixture or database server. They test imports, reporting, candidate pagination, client switching, offline screens, client management, backups, origin/host restrictions and the instance lock. The new lockfile includes native SQLite packages for supported platforms; Windows/macOS launcher and browser-opening behavior need a smoke test on the owner's actual machine.

Put real exports only in git-ignored `local-data/` and run `npm run reconcile` to print parser/reporting aggregates without candidate names. No files returns exit 2; invalid files return 1. Compare the same confirmed dates/snapshot with the owner's trusted report. See [docs/status.md](docs/status.md) for actual verification and outstanding owner-demo inputs.
