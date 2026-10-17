import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { META_HEADERS } from '../src/server/importers/meta';
import { INDEED_HEADERS } from '../src/server/importers/indeed';
import { DRIVERHUB_HEADERS } from '../src/server/importers/driverhub';
export function metaCSV(
  spend = '10.10',
  overrides: Record<string, string> = {},
) {
  return Papa.unparse({
    fields: [...META_HEADERS],
    data: [
      META_HEADERS.map(
        (h) =>
          (
            ({
              'Reporting starts': '4/1/2026',
              'Reporting ends': '6/9/2026',
              'Ad set name':
                'Example Freight: Local Driver – CDL A: Example City, MN',
              'Ad set delivery': 'active',
              Results: '12',
              'Result indicator': 'actions:link_click',
              'Cost per results': '0.84',
              'Ad set budget': '100',
              'Ad set budget type': 'Lifetime',
              'Amount spent (USD)': spend,
              Impressions: '1,200',
              Reach: '900',
              Frequency: '1.33',
              'Unique link clicks': '10',
              Starts: '4/1/2026',
              Ends: 'Ongoing',
              Bid: '0',
              ...overrides,
            }) as Record<string, string>
          )[h] ?? '',
      ),
    ],
  });
}
export function indeedCSV() {
  return Papa.unparse({
    fields: [...INDEED_HEADERS],
    data: [
      [
        'Local Driver – Example City, MN',
        'Yes',
        '200',
        '0.1',
        '20',
        '0.2',
        '4',
        '0.75',
        '3',
        '0.15',
        '15.25',
        '0.7625',
        '3.8125',
        '5.08',
        '1',
        '20',
        '4',
        '3',
        '15.25',
      ],
      [
        'Jobs not in a campaign',
        'No',
        '100',
        '0.1',
        '10',
        '0.2',
        '2',
        '0.5',
        '1',
        '0.1',
        '0',
        '0',
        '0',
        '0',
        '2',
        '5',
        '1',
        '0.5',
        '0',
      ],
      [
        'Standard Plan – Example Freight',
        'No',
        '0',
        '–',
        '0',
        '–',
        '0',
        '–',
        '0',
        '–',
        '10.10',
        '–',
        '–',
        '–',
        '3',
        '–',
        '–',
        '–',
        '–',
      ],
      [
        'Regional bundle',
        'Yes',
        '50',
        '0.1',
        '5',
        '0.2',
        '1',
        '1',
        '1',
        '0.2',
        '4.65',
        '0.93',
        '4.65',
        '4.65',
        '2',
        '2.5',
        '0.5',
        '0.5',
        '2.325',
      ],
    ],
  });
}
export async function candidateXLSX(
  options: { badDate?: boolean; zero?: boolean; formula?: boolean } = {},
) {
  const book = new ExcelJS.Workbook();
  book.created = new Date('2026-06-10T12:00:00Z');
  book.modified = book.created;
  const sheet = book.addWorksheet('Data');
  sheet.addRow([...DRIVERHUB_HEADERS]);
  if (!options.zero) {
    const base: Record<string, ExcelJS.CellValue> = {
      'App Created': '06/10/2026 2:02 pm',
      'First Name': 'Synthetic',
      'Last Name': 'Example',
      'App Recruiting Status': 'Attempting Contact',
      'App Referral Source': 'Indeed',
      'Profile Create Date': '06/01/2026',
      'App Status': 'In Progress',
      'Owner operator': 'No',
      'Years Exp.': '5',
      'App Signed Date': '06/10/2026',
      'CDL Exp.': '06/10/2028',
      Endorsements: 'Tank – test only',
      Equipment: 'Tanker',
      'Position Opening': 'Local Driver, CDL A',
      'App Location': 'Example City, MN',
      'App Days in Funnel': '9',
    };
    const add = (extra: Record<string, ExcelJS.CellValue>) =>
      sheet.addRow(
        DRIVERHUB_HEADERS.map((h) => ({ ...base, ...extra })[h] ?? ''),
      );
    add({
      'App Signed Date': options.badDate ? '02/30/2026' : '06/10/2026',
      'Start Date': '06/10/2026',
    });
    add({
      'App Signed Date': '',
      'App Created': '06/09/2026 9:15 am',
      ...(options.formula
        ? { 'Years Exp.': { formula: '1+1', result: 2 } }
        : {}),
    });
    add({
      'First Name': 'Fixture',
      'Last Name': 'Candidate',
      'App Recruiting Status': 'Ready for Interview\tAttempting Contact',
      'App Status': 'Rejected\t+1 Rejected',
      'App Referral Source': 'Indeed\t+1 Facebook',
      'App Location': 'Example City, MN\t+1 Sample City, IA',
      'App Signed Date': '',
    });
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function generateFixtures() {
  await mkdir('fixtures', { recursive: true });
  await writeFile('fixtures/meta.csv', metaCSV());
  await writeFile('fixtures/meta-replacement.csv', metaCSV('20.20'));
  await writeFile(
    'fixtures/meta-bad-date.csv',
    metaCSV('30.30', { 'Reporting ends': '02/30/2026' }),
  );
  await writeFile('fixtures/meta-zero.csv', META_HEADERS.join(','));
  await writeFile(
    'fixtures/Indeed_JobsCampaigns_20260504_20260610.csv',
    indeedCSV(),
  );
  await writeFile('fixtures/indeed-zero.csv', INDEED_HEADERS.join(','));
  await writeFile('fixtures/driverhub.xlsx', await candidateXLSX());
  await writeFile(
    'fixtures/driverhub-bad-date.xlsx',
    await candidateXLSX({ badDate: true }),
  );
  await writeFile(
    'fixtures/driverhub-zero.xlsx',
    await candidateXLSX({ zero: true }),
  );
}
if (process.argv[1]?.endsWith('fixtures.ts'))
  generateFixtures().then(() => console.log('Synthetic fixtures generated.'));
