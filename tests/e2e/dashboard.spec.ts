import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import * as schema from '../../src/server/db/schema';
import { ImportService } from '../../src/server/imports/service';
import { storage } from '../../src/server/imports/storage';
import { candidateXLSX, indeedCSV, metaCSV } from '../../scripts/fixtures';

const slug = 'dashboard-fixture';
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Disposable TEST_DATABASE_URL required.');
  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema });
    const [client] = await db
      .insert(schema.clients)
      .values({ name: 'Dashboard Fixture', slug })
      .returning();
    await db.insert(schema.clients).values({
      name: 'Empty Dashboard Fixture',
      slug: 'empty-dashboard-fixture',
    });
    process.env.PRIVATE_STORAGE_DIR = './test-results/dashboard-originals';
    process.env.FILE_STORAGE = 'disk';
    const service = new ImportService({ db, files: storage() });
    const actor = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Fixture Admin',
      role: 'admin' as const,
      active: true,
    };
    const csvRows = [
      metaCSV(),
      metaCSV('20.20', {
        'Ad set name': 'Ended campaign',
        'Ad set delivery': 'completed',
        'Ad set budget type': 'Daily',
        Ends: '6/1/2026',
      }),
    ].map((csv) => Papa.parse<string[]>(csv).data);
    const meta = await service.preview(
      actor,
      client.id,
      'meta-dashboard.csv',
      Buffer.from(Papa.unparse([csvRows[0][0], csvRows[0][1], csvRows[1][1]])),
    );
    await service.confirm(actor, client.id, meta.id, {
      confirmed: true,
      expectedActiveId: '',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-09',
    });
    const indeed = await service.preview(
      actor,
      client.id,
      'Indeed_JobsCampaigns_20260504_20260610.csv',
      Buffer.from(indeedCSV()),
    );
    await service.confirm(actor, client.id, indeed.id, {
      confirmed: true,
      expectedActiveId: '',
      periodStart: '2026-05-04',
      periodEnd: '2026-06-10',
    });
    const book = new ExcelJS.Workbook();
    const workbookBytes = await candidateXLSX();
    await book.xlsx.load(
      workbookBytes.buffer.slice(
        workbookBytes.byteOffset,
        workbookBytes.byteOffset + workbookBytes.byteLength,
      ) as ArrayBuffer,
    );
    const sheet = book.getWorksheet('Data')!;
    sheet.getCell('D2').value = 'Connected';
    sheet.getCell('H2').value = 'Rejected';
    sheet.getCell('G2').value = 'Synthetic experience reason';
    for (let i = 0; i < 27; i++) sheet.addRow(sheet.getRow(2).values);
    const candidates = await service.preview(
      actor,
      client.id,
      'dashboard.xlsx',
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    await service.confirm(actor, client.id, candidates.id, {
      confirmed: true,
      expectedActiveId: '',
      snapshotDate: '2026-06-10',
    });
  } finally {
    await pool.end();
  }
});
async function login(page: Page, role = 'staff') {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your clients' }),
  ).toBeVisible();
  await page.goto(`/c/${slug}/dashboard`);
}
test('staff see reconciled KPIs, filtered ad totals, exact paginated candidate populations and mobile tables', async ({
  page,
}) => {
  await login(page);
  await expect(page.locator('[data-kpi="Total candidates"]')).toContainText(
    '30',
  );
  await expect(page.locator('[data-kpi="Signed applications"]')).toContainText(
    '28',
  );
  await expect(page.locator('[data-kpi="Recorded starts"]')).toContainText(
    '28',
  );
  await expect(page.locator('[data-kpi="Lead → application"]')).toContainText(
    '93.33%',
  );
  await expect(page.locator('[data-kpi="Meta spend"]')).toContainText('$30.30');
  await expect(page.locator('[data-kpi="Indeed spend"]')).toContainText(
    '$30.00',
  );
  await expect(page.locator('[data-source="meta"]')).toContainText(
    '2026-04-01 – 2026-06-09',
  );
  await expect(page.locator('[data-source="indeed"]')).toContainText(
    '2026-05-04 – 2026-06-10',
  );
  await expect(page.locator('[data-source="driverhub"]')).toContainText(
    'Snapshot 2026-06-10',
  );
  const links = await page
    .locator('a[data-candidate-count]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        href: node.getAttribute('href')!,
        count: Number(node.getAttribute('data-candidate-count')),
      })),
    );
  expect(links.length).toBeGreaterThan(10);
  for (const { href, count } of links) {
    await page.goto(href);
    await expect(page.locator('[data-candidate-total]')).toHaveAttribute(
      'data-candidate-total',
      String(count),
    );
    const rowNumbers: string[] = [];
    for (;;) {
      rowNumbers.push(
        ...(await page.locator('tbody th[scope="row"]').allTextContents()),
      );
      if (!(await page.getByRole('link', { name: 'Next page' }).count())) break;
      await page.getByRole('link', { name: 'Next page' }).click();
      await expect(
        page.getByRole('link', { name: 'Previous page' }),
      ).toBeVisible();
    }
    expect(rowNumbers).toHaveLength(count);
    expect(new Set(rowNumbers).size).toBe(count);
  }
  await page.goto(`/c/${slug}/dashboard`);
  await page.getByLabel('Meta delivery').selectOption('ended');
  await page.getByRole('button', { name: 'Filter Meta' }).click();
  const meta = page.getByRole('region', { name: 'Meta performance table' });
  await expect(meta.locator('tbody tr')).toHaveCount(1);
  await expect(meta.locator('tfoot')).toContainText('$20.20');
  await expect(meta.locator('tbody')).toContainText('—');
  await page.getByLabel('Indeed type').selectOption('organic');
  await page.getByRole('button', { name: 'Filter Indeed' }).click();
  const indeed = page.getByRole('region', { name: 'Indeed performance table' });
  await expect(indeed.locator('tbody tr')).toHaveCount(1);
  await expect(indeed.locator('tfoot')).toContainText('$0.00');
  await expect(page.getByLabel('Meta delivery')).toHaveValue('ended');
  await page.goto(`/c/${slug}/dashboard`);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/dashboard-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
  });
  const metric = page
    .getByRole('region', { name: 'Meta performance table' })
    .locator('.metric-value')
    .first();
  await metric.focus();
  await expect(metric.getByRole('tooltip')).toBeVisible();
  const foreignSnapshot = links[0].href.replace(
    `/c/${slug}/`,
    '/c/empty-dashboard-fixture/',
  );
  await page.goto(foreignSnapshot);
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});
test('missing sources remain explicit and delayed client navigation never relabels another client’s dashboard', async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    const errors: string[] = [];
    (window as unknown as { clientMismatches: string[] }).clientMismatches =
      errors;
    new MutationObserver(() => {
      const dashboard = document.querySelector('[data-dashboard-client]');
      const title = document.querySelector('h1')?.textContent;
      if (
        dashboard &&
        title === 'Empty Dashboard Fixture' &&
        dashboard.getAttribute('data-dashboard-client') !==
          'empty-dashboard-fixture'
      )
        errors.push('Previous client data under new client header');
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await page.route('**/c/empty-dashboard-fixture/dashboard*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption('empty-dashboard-fixture');
  await expect(page.locator('[data-dashboard-client]')).toHaveAttribute(
    'data-dashboard-client',
    'empty-dashboard-fixture',
  );
  await expect(page.locator('[data-source="indeed"]')).toContainText(
    'Not uploaded',
  );
  await expect(page.locator('[data-kpi="Meta spend"]')).toContainText('—');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { clientMismatches: string[] }).clientMismatches,
    ),
  ).toEqual([]);
  // Existing imports journey leaves a Meta-only client. Upload directly here to keep this check independent of test order.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 'admin');
  await page.goto('/c/empty-dashboard-fixture/imports');
  await page.getByLabel('Export file').setInputFiles('fixtures/meta.csv');
  await page.getByRole('button', { name: 'Upload and preview' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm and activate' }).click();
  await expect(page.getByRole('status')).toContainText('Import activated');
  await page.goto('/c/empty-dashboard-fixture/dashboard');
  await expect(page.locator('[data-source="indeed"]')).toContainText(
    'Not uploaded',
  );
  await expect(page.locator('[data-kpi="Meta spend"]')).toContainText('$10.10');
  await expect(
    page
      .getByRole('region', { name: 'Meta performance table' })
      .locator('tbody tr'),
  ).toHaveCount(1);
  await page.goto(`/c/${slug}/settings`);
  await page.getByLabel('Interview statuses').fill('Attempting Contact');
  await page.getByRole('button', { name: 'Save stage mapping' }).click();
  await expect(page.getByRole('status')).toContainText('Stage mapping saved');
  await page.goto(`/c/${slug}/dashboard`);
  await expect(
    page.getByRole('link', {
      name: 'Interview stage: 1 candidates',
      exact: true,
    }),
  ).toBeVisible();
});
