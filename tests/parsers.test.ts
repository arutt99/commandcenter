import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseFile } from '../src/server/importers';
import { META_HEADERS, parseMeta } from '../src/server/importers/meta';
import { INDEED_HEADERS, parseIndeed } from '../src/server/importers/indeed';
import {
  parseDriverhub,
  checkArchive,
} from '../src/server/importers/driverhub';
import { MAX_BYTES, MAX_ROWS } from '../src/server/importers/types';
import { sum } from '../src/server/importers/common';
import { metaCSV, indeedCSV, candidateXLSX } from '../scripts/fixtures';
describe('strict export parsing', () => {
  it('rejects unknown XLSX headers before interpreting or reporting row contents', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Data');
    sheet.addRow(['Synthetic private text']);
    sheet.addRow([{ formula: '1+1', result: 2 }]);
    const result = await parseDriverhub(
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
    expect(JSON.stringify(result.errors)).not.toContain(
      'Synthetic private text',
    );
  });
  it('preserves exact money and aggregate counts beyond float precision', () => {
    expect(
      sum(
        [{ spend: '9999999999999999.999999' }, { spend: '0.000001' }],
        'spend',
      ),
    ).toBe('10000000000000000');
    const csv = metaCSV('10', { Impressions: '9007199254740991' });
    const parsed = parseMeta(csv + '\r\n' + csv.split('\r\n')[1]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.totals.impressions).toBe('18014398509481982');
  });
  it('detects Meta, preserves quoted commas/en dashes/raw values and uses exact decimal money', async () => {
    const csv = metaCSV('0.10');
    const text = csv + '\r\n' + csv.split('\r\n')[1].replace('0.10', '0.20');
    const { source, result } = await parseFile(Buffer.from(text), 'meta.csv');
    expect(source).toBe('meta');
    expect(result.errors).toEqual([]);
    expect(result.totals).toMatchObject({
      rowCount: 2,
      spend: '0.3',
      impressions: 2400,
      linkClicks: 24,
    });
    expect(result.rows[0].raw['Ad set name']).toContain(
      '– CDL A: Example City, MN',
    );
    expect(result.detectedPeriod).toEqual({
      start: '2026-04-01',
      end: '2026-06-09',
    });
    expect(result.totals).not.toHaveProperty('reach');
  });
  it('does not treat non-link results or missing results as zero clicks', () => {
    expect(
      parseMeta(metaCSV('10', { 'Result indicator': 'actions:lead' })).totals
        .linkClicks,
    ).toBeNull();
    expect(
      parseMeta(metaCSV('10', { Results: '' })).totals.linkClicks,
    ).toBeNull();
  });
  it('rejects missing, unknown, duplicate, and overridden incompatible headers', async () => {
    expect(
      parseMeta(metaCSV().replace('Reach,', 'Unrecognized,')).errors.length,
    ).toBeGreaterThan(0);
    expect(
      parseMeta(metaCSV().replace('Reach,', 'Results,')).errors.length,
    ).toBeGreaterThan(0);
    const { result } = await parseFile(
      Buffer.from(indeedCSV()),
      'file.csv',
      'meta',
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      (await parseFile(Buffer.from('something,else\n1,2'), 'file.csv')).source,
    ).toBeNull();
  });
  it.each(['02/30/2026', '13/1/2026', '6/10/26', 'not a date'])(
    'rejects a bad date without throwing or guessing: %s',
    (date) => {
      const result = parseMeta(metaCSV('10', { 'Reporting ends': date }));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 2, column: 'Reporting ends' }),
      );
    },
  );
  it.each(['oops', 'NaN', '-1', '1,2', 'Infinity', '1e3'])(
    'rejects bad numbers without silently using zero: %s',
    (spend) => {
      const result = parseMeta(metaCSV(spend));
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 2, column: 'Amount spent (USD)' }),
      );
      expect(result.totals.spend).toBeUndefined();
    },
  );
  it('rejects fractional counts and inconsistent Meta periods', () => {
    expect(
      parseMeta(metaCSV('10', { Impressions: '1.5' })).errors.length,
    ).toBeGreaterThan(0);
    const a = metaCSV();
    const b = metaCSV('20', { 'Reporting starts': '5/1/2026' });
    expect(parseMeta(a + '\r\n' + b.split('\r\n')[1]).errors).toContainEqual({
      message:
        'Rows have different reporting periods. Export one consistent period.',
    });
  });
  it('includes every Indeed row type, ignores stored rates, and only suggests filename dates', () => {
    const result = parseIndeed(
      indeedCSV(),
      'Indeed_JobsCampaigns_20260504_20260610.csv',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.rowKind)).toEqual([
      'job',
      'organic',
      'plan',
      'bundle',
    ]);
    expect(result.totals).toEqual({
      rowCount: 4,
      spend: '30',
      impressions: 350,
      clicks: 35,
      applyStarts: 7,
      applies: 5,
    });
    expect(result.detectedPeriod).toEqual({
      start: '2026-05-04',
      end: '2026-06-10',
    });
    expect(
      parseIndeed(indeedCSV(), 'export_20260230_20260610.csv').detectedPeriod,
    ).toBeUndefined();
  });
  it('keeps same-name candidates separate and preserves all tab-joined and +1 values', async () => {
    const result = await parseDriverhub(await candidateXLSX());
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].firstName).toBe(result.rows[1].firstName);
    expect(result.rows[2].recruitingStatus).toBeNull();
    expect(result.rows[2].values['App Recruiting Status']).toEqual([
      'Ready for Interview',
      'Attempting Contact',
    ]);
    expect(result.rows[2].raw['App Status']).toBe('Rejected\t+1 Rejected');
    expect(result.rows[2].ambiguousFields).toContain('App Location');
    expect(result.totals).toMatchObject({
      candidateCount: 3,
      signedDates: 1,
      startDates: 1,
      ambiguousRows: 1,
      ambiguousCells: 4,
    });
    expect(result.detectedSnapshot).toBe('2026-06-10');
  });
  it('rejects invalid XLSX dates without including candidate names in errors', async () => {
    const result = await parseDriverhub(await candidateXLSX({ badDate: true }));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ row: 2, column: 'App Signed Date' }),
    );
    expect(JSON.stringify(result.errors)).not.toContain('Synthetic');
  });
  it('rejects formulas even when they have a cached result', async () => {
    const result = await parseDriverhub(await candidateXLSX({ formula: true }));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ row: 3, column: 'Years Exp.' }),
    );
  });
  it('treats zero rows as actual zero with no invented period', async () => {
    expect(parseMeta(META_HEADERS.join(',')).totals).toMatchObject({
      rowCount: 0,
      spend: '0',
    });
    expect(parseIndeed(INDEED_HEADERS.join(',')).totals).toMatchObject({
      rowCount: 0,
      spend: '0',
    });
    const result = await parseDriverhub(await candidateXLSX({ zero: true }));
    expect(result.errors).toEqual([]);
    expect(result.totals.candidateCount).toBe(0);
    expect(result.detectedSnapshot).toBeUndefined();
  });
  it('enforces the 10 MB and 50k row limits', async () => {
    expect(
      (await parseFile(Buffer.alloc(MAX_BYTES + 1), 'meta.csv', 'meta')).result
        .errors.length,
    ).toBeGreaterThan(0);
    const csv = metaCSV();
    const row = csv.split('\r\n')[1];
    const result = parseMeta(
      csv.split('\r\n')[0] +
        '\r\n' +
        Array(MAX_ROWS + 1)
          .fill(row)
          .join('\r\n'),
    );
    expect(result.errors).toContainEqual({ message: 'Limit is 50,000 rows.' });
  });
  it('checks inflated ZIP size before loading XML', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Data').addRow(['plain']);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buffer.writeUInt32LE(101 * 1024 * 1024, central + 24);
    await expect(checkArchive(buffer)).rejects.toThrow();
  });
});
