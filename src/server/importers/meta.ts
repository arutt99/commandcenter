import {
  checkHeaders,
  csvTable,
  dateValue,
  numberValue,
  requiredText,
  sum,
  countSum,
} from './common';
import type { MetaRow, ParseResult } from './types';
export const META_HEADERS = [
  'Reporting starts',
  'Reporting ends',
  'Ad set name',
  'Ad set delivery',
  'Results',
  'Result indicator',
  'Cost per results',
  'Ad set budget',
  'Ad set budget type',
  'Amount spent (USD)',
  'Impressions',
  'Reach',
  'Frequency',
  'Unique link clicks',
  'Ends',
  'Starts',
  'Attribution setting',
  'Bid',
  'Bid type',
  'Last significant edit',
] as const;

export function parseMeta(text: string): ParseResult<MetaRow> {
  const table = csvTable(text);
  const errors = [
    ...table.errors,
    ...checkHeaders(table.headers, META_HEADERS),
  ];
  const result: ParseResult<MetaRow> = {
    rows: [],
    totals: {},
    warnings: [],
    errors,
  };
  if (errors.length) return result;
  const periods = new Set<string>();
  for (const { rowNo, raw } of table.rows) {
    const n = (key: string, optional = false, integer = false) =>
      numberValue(raw, key, rowNo, errors, {
        optional,
        integer,
        currency: /spent|budget|Cost|Bid/.test(key),
      });
    const start = dateValue(
      raw['Reporting starts'],
      'Reporting starts',
      rowNo,
      errors,
      false,
    );
    const end = dateValue(
      raw['Reporting ends'],
      'Reporting ends',
      rowNo,
      errors,
      false,
    );
    if (start && end) {
      if (start > end)
        errors.push({
          row: rowNo,
          message: 'Reporting start is after reporting end.',
        });
      periods.add(`${start}/${end}`);
    }
    // Validate unused numeric fields too; preserve every original value.
    n('Cost per results', true);
    n('Bid', true);
    const row: MetaRow = {
      rowNo,
      raw,
      adSetName: requiredText(raw, 'Ad set name', rowNo, errors),
      delivery: raw['Ad set delivery'],
      results: nullableNumber(n('Results', true, true)),
      resultIndicator: raw['Result indicator'].trim(),
      spend: n('Amount spent (USD)') ?? '',
      impressions: Number(n('Impressions', false, true)),
      reach: nullableNumber(n('Reach', true, true)),
      frequency: n('Frequency', true),
      uniqueLinkClicks: nullableNumber(n('Unique link clicks', true, true)),
      budget: n('Ad set budget', true),
      budgetType: raw['Ad set budget type'],
      starts: dateValue(raw.Starts, 'Starts', rowNo, errors),
      ends: /^(ongoing|continuous)$/i.test(raw.Ends.trim())
        ? null
        : dateValue(raw.Ends, 'Ends', rowNo, errors),
    };
    result.rows.push(row);
    if (row.resultIndicator !== 'actions:link_click' || row.results === null)
      result.warnings.push({
        row: rowNo,
        column: 'Results',
        message:
          'Link clicks are unavailable: results are missing or are not link clicks.',
      });
  }
  if (periods.size > 1)
    errors.push({
      message:
        'Rows have different reporting periods. Export one consistent period.',
    });
  if (periods.size === 1) {
    const [start, end] = [...periods][0].split('/');
    result.detectedPeriod = { start, end };
  }
  if (errors.length) {
    result.totals = { rowCount: result.rows.length };
    return result;
  }
  result.totals = {
    rowCount: result.rows.length,
    spend: sum(result.rows, 'spend'),
    impressions: countSum(result.rows, 'impressions'),
    linkClicks: result.warnings.length
      ? null
      : countSum(result.rows, 'results'),
  };
  return result;
}
function nullableNumber(n: string | null) {
  return n === null ? null : Number(n);
}
