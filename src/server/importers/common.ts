import Decimal from 'decimal.js';
import Papa from 'papaparse';
import type { Issue, Raw } from './types';
import { MAX_ROWS } from './types';
const ExactDecimal = Decimal.clone({ precision: 40 });

export function checkHeaders(
  headers: string[],
  expected: readonly string[],
): Issue[] {
  const errors: Issue[] = [];
  for (const name of expected)
    if (!headers.includes(name))
      errors.push({ column: name, message: 'Required header is missing.' });
  if (headers.some((h) => !expected.includes(h)))
    errors.push({
      message: 'Unrecognized headers. Use the supported export format.',
    });
  if (new Set(headers).size !== headers.length)
    errors.push({ message: 'Duplicate headers are not supported.' });
  return errors;
}

export function csvTable(text: string): {
  headers: string[];
  rows: { rowNo: number; raw: Raw }[];
  errors: Issue[];
} {
  const errors: Issue[] = [];
  let headers: string[] | undefined;
  const rows: { rowNo: number; raw: Raw }[] = [];
  let record = 0;
  Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
    step(result, parser) {
      record++;
      if (result.errors.length)
        errors.push({ row: record, message: 'Malformed CSV record.' });
      if (!headers) {
        headers = result.data.map((v) => v.trim());
        return;
      }
      if (rows.length === MAX_ROWS) {
        errors.push({ message: 'Limit is 50,000 rows.' });
        parser.abort();
        return;
      }
      if (result.data.length !== headers.length)
        errors.push({
          row: record,
          message: 'Column count does not match the header.',
        });
      rows.push({
        rowNo: record,
        raw: Object.fromEntries(
          headers.map((h, i) => [h, result.data[i] ?? '']),
        ),
      });
    },
  });
  return { headers: headers ?? [], rows, errors };
}

export function problem(
  errors: Issue[],
  row: number,
  column: string,
  message: string,
) {
  errors.push({ row, column, message });
}
const absent = (s: string) => s === '' || s === '-' || s === '–' || s === '—';
export function numberValue(
  raw: Raw,
  key: string,
  row: number,
  errors: Issue[],
  options: { optional?: boolean; integer?: boolean; currency?: boolean } = {},
): string | null {
  let text = (raw[key] ?? '').trim();
  if (options.optional && absent(text)) return null;
  if (options.currency) text = text.replace(/^\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
    problem(errors, row, key, 'Expected a non-negative number.');
    return null;
  }
  const n = new ExactDecimal(text.replaceAll(',', ''));
  if (
    (options.integer && (!n.isInteger() || n.gt(Number.MAX_SAFE_INTEGER))) ||
    n.gt('9999999999999999.999999')
  ) {
    problem(errors, row, key, 'Number is out of range or is not an integer.');
    return null;
  }
  return n.toFixed();
}

export function dateValue(
  value: string,
  key: string,
  row: number,
  errors: Issue[],
  optional = true,
  datetime = false,
): string | null {
  const text = value.trim();
  if (!text && optional) return null;
  const pattern = datetime
    ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})\s*(am|pm))?$/i
    : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const m = pattern.exec(text);
  if (m) {
    const [, month, day, year, hour, minute] = m;
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    if (
      +year >= 1900 &&
      +year <= 2200 &&
      date.getUTCFullYear() === +year &&
      date.getUTCMonth() === +month - 1 &&
      date.getUTCDate() === +day &&
      (!hour || (+hour >= 1 && +hour <= 12 && +minute <= 59))
    )
      return date.toISOString().slice(0, 10);
  }
  problem(
    errors,
    row,
    key,
    'Expected a valid calendar date in the export format.',
  );
  return null;
}
export function validISODate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return !!m && dateValue(`${m[2]}/${m[3]}/${m[1]}`, '', 0, [], false) === text;
}
export function sum(rows: Record<string, unknown>[], key: string): string {
  return rows
    .reduce((a, row) => a.add(String(row[key] ?? 0)), new ExactDecimal(0))
    .toFixed();
}
export function countSum(
  rows: Record<string, unknown>[],
  key: string,
): number | string {
  const total = sum(rows, key);
  return new ExactDecimal(total).lte(Number.MAX_SAFE_INTEGER)
    ? Number(total)
    : total;
}
export function requiredText(
  raw: Raw,
  key: string,
  row: number,
  errors: Issue[],
): string {
  if (!raw[key]?.trim())
    problem(errors, row, key, 'Required value is missing.');
  return raw[key]?.trim() ?? '';
}
