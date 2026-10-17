import {
  checkHeaders,
  csvTable,
  dateValue,
  numberValue,
  requiredText,
  sum,
  countSum,
} from './common';
import type { IndeedRow, ParseResult } from './types';
export const INDEED_HEADERS = [
  'Campaign',
  'Premium',
  'Impressions',
  'Clickthrough rate (CTR)',
  'Clicks',
  'Apply start rate (ASR)',
  'Apply starts',
  'Apply completion rate (ACR)',
  'Applies',
  'Apply rate (AR)',
  'Spend',
  'Cost per click (CPC)',
  'Cost per apply start (CPAS)',
  'Cost per apply (CPA)',
  'Job Count',
  'Avg clicks per job',
  'Avg apply starts per job',
  'Avg applies per job',
  'Avg spend per job',
] as const;
export function parseIndeed(
  text: string,
  filename = '',
): ParseResult<IndeedRow> {
  const table = csvTable(text);
  const errors = [
    ...table.errors,
    ...checkHeaders(table.headers, INDEED_HEADERS),
  ];
  const result: ParseResult<IndeedRow> = {
    rows: [],
    totals: {},
    warnings: [],
    errors,
  };
  if (errors.length) return result;
  for (const { rowNo, raw } of table.rows) {
    const n = (key: string, integer = false, optional = false) =>
      numberValue(raw, key, rowNo, errors, {
        integer,
        optional,
        currency: /Spend|spend|Cost/.test(key),
      });
    for (const key of INDEED_HEADERS.slice(3).filter(
      (k) =>
        !['Clicks', 'Apply starts', 'Applies', 'Spend', 'Job Count'].includes(
          k,
        ),
    ))
      n(key, false, true);
    const campaign = requiredText(raw, 'Campaign', rowNo, errors);
    const jobCount = Number(n('Job Count', true));
    result.rows.push({
      rowNo,
      raw,
      campaign,
      premium: raw.Premium,
      impressions: Number(n('Impressions', true)),
      clicks: Number(n('Clicks', true)),
      applyStarts: Number(n('Apply starts', true)),
      applies: Number(n('Applies', true)),
      spend: n('Spend') ?? '',
      jobCount,
      rowKind:
        campaign === 'Jobs not in a campaign'
          ? 'organic'
          : /^(Standard Plan|Premium Plan)/.test(campaign)
            ? 'plan'
            : jobCount > 1
              ? 'bundle'
              : 'job',
    });
  }
  const dates = /_(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})(?:\.csv)?$/i.exec(
    filename,
  );
  if (dates) {
    const start = dateValue(
      `${dates[2]}/${dates[3]}/${dates[1]}`,
      'period start',
      0,
      [],
      false,
    );
    const end = dateValue(
      `${dates[5]}/${dates[6]}/${dates[4]}`,
      'period end',
      0,
      [],
      false,
    );
    if (start && end && start <= end) result.detectedPeriod = { start, end };
  }
  result.warnings.push({
    message:
      'Indeed reporting dates must be confirmed; filename dates are a suggestion only.',
  });
  if (errors.length) {
    result.totals = { rowCount: result.rows.length };
    return result;
  }
  result.totals = {
    rowCount: result.rows.length,
    spend: sum(result.rows, 'spend'),
    impressions: countSum(result.rows, 'impressions'),
    clicks: countSum(result.rows, 'clicks'),
    applyStarts: countSum(result.rows, 'applyStarts'),
    applies: countSum(result.rows, 'applies'),
  };
  return result;
}
