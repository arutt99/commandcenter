import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { checkHeaders, dateValue, numberValue, requiredText } from './common';
import {
  MAX_BYTES,
  MAX_ROWS,
  type CandidateRow,
  type Issue,
  type ParseResult,
  type Raw,
} from './types';
export const DRIVERHUB_HEADERS = [
  'App Created',
  'First Name',
  'Last Name',
  'App Recruiting Status',
  'App Referral Source',
  'Profile Create Date',
  'App Rejection Reason',
  'App Status',
  'Owner operator',
  'Years Exp.',
  'App Signed Date',
  'CDL Exp.',
  'Endorsements',
  'Equipment',
  'Start Date',
  'Position Opening',
  'App Location',
  'App Days in Funnel',
] as const;

// Inspect the ZIP central directory before ExcelJS inflates any workbook contents.
export async function checkArchive(buffer: Buffer): Promise<void> {
  if (buffer.length > MAX_BYTES) throw new Error('Limit is 10 MB.');
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('Invalid XLSX archive.'));
      let size = 0;
      let inflated = 0;
      let entries = 0;
      let finished = false;
      let currentStream: NodeJS.ReadableStream | undefined;
      const fail = () => {
        if (!finished) {
          finished = true;
          if (currentStream && 'destroy' in currentStream)
            (currentStream as import('node:stream').Readable).destroy();
          zip.close();
          reject(
            new Error(
              'XLSX archive exceeds safety limits or contains unsupported content.',
            ),
          );
        }
      };
      zip.on('error', fail);
      zip.on('entry', (entry: yauzl.Entry) => {
        size += entry.uncompressedSize;
        entries++;
        if (
          size > 100 * 1024 * 1024 ||
          entries > 2000 ||
          entry.generalPurposeBitFlag & 1 ||
          /vbaProject|externalLinks/i.test(entry.fileName)
        )
          return fail();
        // Verify actual inflated bytes too: central-directory sizes can be forged.
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail();
          currentStream = stream;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            inflated += chunk.length;
            if (inflated > 100 * 1024 * 1024) fail();
          });
          stream.on('end', () => {
            currentStream = undefined;
            if (!finished) zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      });
      zip.readEntry();
    });
  });
}

export function parseCandidateTable(
  headers: string[],
  input: { rowNo: number; raw: Raw }[],
  initialErrors: Issue[] = [],
): ParseResult<CandidateRow> {
  const errors = [
    ...initialErrors,
    ...checkHeaders(headers, DRIVERHUB_HEADERS),
  ];
  const result: ParseResult<CandidateRow> = {
    rows: [],
    totals: {},
    warnings: [],
    errors,
  };
  if (input.length > MAX_ROWS)
    errors.push({ message: 'Limit is 50,000 rows.' });
  if (errors.length) return result;
  for (const { rowNo, raw } of input) {
    const ambiguousFields = headers.filter(
      (h) => raw[h].includes('\t') || /\+\d+\b/.test(raw[h]),
    );
    const values = Object.fromEntries(
      headers.map((h) => [h, raw[h].split('\t')]),
    );
    const text = (key: string) =>
      ambiguousFields.includes(key) ? null : raw[key].trim() || null;
    const date = (key: string, required = false) =>
      ambiguousFields.includes(key)
        ? null
        : dateValue(
            raw[key],
            key,
            rowNo,
            errors,
            !required,
            key === 'App Created' || key === 'Profile Create Date',
          );
    requiredText(raw, 'First Name', rowNo, errors);
    requiredText(raw, 'Last Name', rowNo, errors);
    date('Profile Create Date');
    const days = ambiguousFields.includes('App Days in Funnel')
      ? null
      : numberValue(raw, 'App Days in Funnel', rowNo, errors, {
          optional: true,
          integer: true,
        });
    const yearsExp = ambiguousFields.includes('Years Exp.')
      ? null
      : numberValue(raw, 'Years Exp.', rowNo, errors, { optional: true });
    if (days !== null && Number(days) > 2147483647)
      errors.push({
        row: rowNo,
        column: 'App Days in Funnel',
        message: 'Days in funnel is out of range.',
      });
    result.rows.push({
      rowNo,
      raw,
      firstName: text('First Name'),
      lastName: text('Last Name'),
      appCreated: date('App Created', true),
      recruitingStatus: text('App Recruiting Status'),
      referralSource: text('App Referral Source'),
      rejectionReason: text('App Rejection Reason'),
      appStatus: text('App Status'),
      ownerOperator: text('Owner operator'),
      yearsExp,
      signedDate: date('App Signed Date'),
      cdlExp: date('CDL Exp.'),
      endorsements: text('Endorsements'),
      equipment: text('Equipment'),
      startDate: date('Start Date'),
      position: text('Position Opening'),
      location: text('App Location'),
      daysInFunnel: days === null ? null : Number(days),
      ambiguousFields,
      values,
    });
  }
  const ambiguous = result.rows.filter((r) => r.ambiguousFields.length).length;
  if (ambiguous)
    result.warnings.push({
      message: `${ambiguous} candidate ${ambiguous === 1 ? 'row contains' : 'rows contain'} multiple values or +N annotations and ${ambiguous === 1 ? 'needs' : 'need'} review. No values were chosen or people split.`,
    });
  result.warnings.push({
    message:
      'Confirm the snapshot date. The newest App Created date is a suggestion, not a known export date.',
  });
  result.detectedSnapshot = result.rows
    .map((r) => r.appCreated)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  result.totals = {
    candidateCount: result.rows.length,
    signedDates: result.rows.filter((r) => r.signedDate).length,
    startDates: result.rows.filter((r) => r.startDate).length,
    ambiguousRows: ambiguous,
    ambiguousCells: result.rows.reduce(
      (n, r) => n + r.ambiguousFields.length,
      0,
    ),
  };
  return result;
}

export async function parseDriverhub(
  buffer: Buffer,
): Promise<ParseResult<CandidateRow>> {
  const invalid = (message: string): ParseResult<CandidateRow> => ({
    rows: [],
    totals: {},
    warnings: [],
    errors: [{ message }],
  });
  try {
    await checkArchive(buffer);
  } catch {
    return invalid(
      'Invalid or oversized XLSX archive. Macros and external links are unsupported.',
    );
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    return invalid('Unable to read XLSX workbook.');
  }
  const sheet = workbook.getWorksheet('Data');
  if (!sheet) return invalid('Required sheet Data is missing.');
  if (sheet.rowCount > MAX_ROWS + 1) return invalid('Limit is 50,000 rows.');
  const errors: Issue[] = [];
  const cellText = (
    cell: ExcelJS.Cell,
    row: number,
    column: string,
  ): string => {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (value instanceof Date)
      return `${value.getUTCMonth() + 1}/${value.getUTCDate()}/${value.getUTCFullYear()}`;
    if (typeof value === 'object') {
      errors.push({
        row,
        column,
        message:
          'Formulas, hyperlinks, rich text and error cells are unsupported; export plain values.',
      });
      return '';
    }
    return String(value);
  };
  const headers: string[] = [];
  sheet
    .getRow(1)
    .eachCell({ includeEmpty: true }, (cell) =>
      headers.push(cellText(cell, 1, '').trim()),
    );
  // Reject the schema before interpreting cells, so arbitrary header text is
  // never copied into row-level validation errors.
  if (errors.length || checkHeaders(headers, DRIVERHUB_HEADERS).length)
    return parseCandidateTable(headers, [], errors);
  const rows: { rowNo: number; raw: Raw }[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    if (row.cellCount > headers.length)
      errors.push({ row: rowNo, message: 'Column count exceeds the header.' });
    rows.push({
      rowNo,
      raw: Object.fromEntries(
        headers.map((h, i) => [h, cellText(row.getCell(i + 1), rowNo, h)]),
      ),
    });
  });
  return parseCandidateTable(headers, rows, errors);
}
