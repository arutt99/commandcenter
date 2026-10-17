# Local single-owner app — approved direction

The user confirmed that the business has one owner and authorized conversion to a local app without dashboard authentication. This document supersedes the hosted deployment, Supabase authentication/storage, PostgreSQL, RLS, staff/invitation and cron-hosting choices in the v2 build plan. It does not remove the provider authorization required for future automatic connections.

## Current operating model

- One owner, one computer, one active app instance per data folder. No dashboard users, roles, passwords, sign-in links or invitation emails.
- Next.js runs as a local program bound to `127.0.0.1`; the owner opens its browser interface from a shortcut. Host/origin/request-context checks protect the local HTTP boundary.
- Embedded SQLite with Drizzle, versioned migrations and foreign keys. No external database installation, Turso account, Supabase credentials or Docker. Decimal money/count values remain exact text.
- Local private originals and parsed reports live in the operating system's application-data directory, separate from source/build files. The owner can override the directory and local port.
- Existing import limits, strict parsers, previews, confirmations, duplicate detection, replace/revert semantics, audit events and metric definitions continue to apply. The audit actor is the fixed provenance label `local-owner`, not a hidden account.
- Migrations run automatically. Launchers detect stale builds and open the browser. The serving process owns the instance lock, including if its launcher crashes.
- Manual and daily automatic backups contain a consistent SQLite snapshot and every referenced original. Restores run offline, verify integrity/checksums, stage files, and preserve previous data. Keep external copies for machine-loss protection.

## What remains

The owner demo with actual exports, trusted-report reconciliation, provisional stage/branding decisions, candidate retention and other original product features remain open as documented in status/decisions. No later-phase channel performance, alerts, account context, PDF export or live integration has been silently added.

## Future automatic connections

Keep connection adapters outside the browser. First prove each provider's supported access and permissions, then let local jobs retrieve deliveries and pass them through the existing parser/activation transaction. Keep one active dataset per client/source; never add upload and live totals together. Scheduled jobs run while the app and computer are awake, with an explicit manual refresh and last-success/failure information when implemented.

- Meta: approved read access to mapped client ad accounts.
- Indeed: approved agency/employer reporting access, subject to provider eligibility and limits.
- DriverHub: vendor-confirmed API, scheduled export or supported file delivery; no scraping.
- Optional HubSpot/Calendar: user-authorized read-only connections, with account/client mappings.

Use provider-supported desktop/loopback OAuth flows where available, and an OS credential vault for tokens. There is no current provider connection or credential store. No need to recreate dashboard staff authentication merely to add these connections.

## Existing hosted installs

The old PostgreSQL migration is archived at `docs/legacy/0001_postgres.sql`. Local SQLite uses its own migration history and does not open/overwrite a hosted database. Preserve any hosted data and originals, recreate client/settings and re-upload reports to the local app before retiring the old installation. A database conversion utility is not included because no existing real deployment or files were available to migrate/verify.
