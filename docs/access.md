# Access and setup — local single-owner edition

No dashboard login, staff invitations, Supabase account, hosting account or external database is required. The owner runs the app on his machine; use its operating-system login, private application-data folder and screen lock. Source code updates remain in GitHub. The app itself accepts only local, same-origin browser traffic.

Automatic source access is still unverified and outside this change:

| Source                  | Current state           | Next proof needed                                                         |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Meta                    | upload_only             | Prove approved read access to one client ad account.                      |
| Indeed                  | upload_only             | Confirm agency eligibility, employer-account access, limits and cost.     |
| DriverHub / AvatarFleet | upload_only             | Obtain vendor confirmation of a supported API or scheduled file delivery. |
| HubSpot                 | manual (future feature) | Confirm the relevant company fields and read permissions.                 |
| Google Calendar         | manual (future feature) | Confirm the calendar, client mapping and read permissions.                |

Provider permission is separate from signing in to this local dashboard. Tokens are not needed for uploads, and none are embedded in the app, committed to GitHub or claimed to be connected. Future tokens should use the operating system's credential vault.

The owner's setup helper must smoke-test the launcher/browser opening on the actual operating system, confirm data/backup folders, copy a backup to a separate device, and reconcile the actual client exports. Local-machine testing uses synthetic data; it does not establish real vendor or real-report access.
