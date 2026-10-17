# Dashboard metric definitions — Phase 3

All calculations use only the active import for the selected client and source. The server reads sources and their rows in one SQLite transaction. Imports are snapshots: superseded, preview and failed imports are never added to active data. Each metric carries its label, definition, source, source period/snapshot, value and a reason when unavailable. Source upload timestamps use the client's configured timezone; export calendar dates are shown as recorded.

Missing uploads show **Not uploaded** and an unavailable value (—). A valid empty export has zero counts/spend and undefined ratios. A real zero numerator with a positive denominator has a 0% rate. Ratios with zero denominators are unavailable. Money and ratios use decimal.js; aggregate counts remain exact decimal strings even beyond JavaScript's safe-integer limit. Display rounds money to two decimal places and percentages to two decimal places after calculation.

## Meta

| Metric      | Definition                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spend       | Sum of Amount spent (USD).                                                                                                                                         |
| Impressions | Sum of impressions.                                                                                                                                                |
| Link clicks | Sum of Results only when every selected row has results and Result indicator = `actions:link_click`. Otherwise unavailable, with an explanation.                   |
| CTR         | Summed link clicks / summed impressions.                                                                                                                           |
| CPC         | Summed spend / summed link clicks.                                                                                                                                 |
| Budget used | Per-row spend / ad-set budget, only for a positive Lifetime budget; labelled **of lifetime budget**. Values can exceed 100%. Daily budgets are not period budgets. |

Reach, frequency and unique clicks are not aggregated or displayed as totals. The Active filter means exported delivery equals `active`. Ended means exported delivery is `ended`/`completed` or the row's end date is on/before the reporting-period end. Other delivery states remain in All. Filtered totals are computed from the selected rows; headline spend always uses the full active import.

## Indeed

| Metric                                            | Definition                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Spend, impressions, clicks, apply starts, applies | Sum across all rows by default, including job, bundle, organic and plan rows. |
| CTR                                               | Summed clicks / summed impressions.                                           |
| ASR                                               | Summed apply starts / summed clicks.                                          |
| Completion                                        | Summed applies / summed apply starts.                                         |
| CPA                                               | Summed spend / summed applies.                                                |

No rate is averaged from row percentages. Row types are assigned by the importer: `Jobs not in a campaign` → organic; `Standard Plan`/`Premium Plan` prefix → plan; job count > 1 → bundle; otherwise job. Type filters recompute table totals; headline spend includes all types.

## DriverHub recruiting snapshot — provisional

| Label                   | Population                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Total candidates        | Every candidate row. Names are not deduplicated.                                                                       |
| Signed applications     | Valid, unambiguous App Signed Date, including subsequently rejected records.                                           |
| Lead → application      | Signed applications / candidate rows in the same snapshot. This is not a historical conversion rate.                   |
| Interview stage         | Unambiguous recruiting status in the client's configured interview statuses; defaults: Ready for Interview, Connected. |
| Onboarding              | Unambiguous recruiting status in the client's configured onboarding statuses; default: Pending Start Date.             |
| Recorded starts         | Valid, unambiguous Start Date. These are not confirmed hires.                                                          |
| Rejected / disqualified | Unambiguous App Status = Rejected.                                                                                     |
| In progress             | Unambiguous App Status = In Progress.                                                                                  |
| Needs review            | Ambiguous App Recruiting Status or App Status. No status/stage is inferred from a multi-value cell.                    |

Stages overlap and are not a historical sequence. An ambiguous status does not invalidate a separately unambiguous signed/start date. Position and recruiting-status groups include every row, with separate **Not provided** and **Needs review** groups. Rejection-reason groups include only unambiguously rejected rows. Literal values matching these labels remain separate populations.

Every recruiting count links to the same predicate used for that count. Lists contain 25 rows per page, ordered by original row number. Links retain the import ID and, for configurable stages, the displayed mapping. Replacement uploads or mapping edits cannot silently change a previously linked population. A superseded snapshot is labelled historical; the user can return to the dashboard for current data. Imports are always checked against the client in the URL; snapshots belonging to another client and previews cannot be read through this route.

## Display and scope

Ad names are parsed only for display when they match `Client: Title: City, ST`, `Title: City, ST`, or `Title – City, ST` (also hyphen/em dash). Unknown formats show the original name; parsed names also retain their original text. Names never become IDs or attribution keys.

Definitions are available in KPI details and on focus/hover for table values; periods are visible in source cards, KPI subtitles, section headings and table captions. Meta and Indeed periods remain separate; no combined spend or synthetic daily trend is calculated. Channel attribution, alerts, manual period budgets and snapshot/PDF exports belong to Phase 4. Owner confirmation of stage definitions and real-file reconciliation remain required before the owner demo can be signed off.
