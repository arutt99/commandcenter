import { expect, test, type Page } from '@playwright/test';
async function login(page: Page, role = 'admin') {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your clients' }),
  ).toBeVisible();
}
async function upload(page: Page, file: string) {
  await page.getByLabel('Export file').setInputFiles(`fixtures/${file}`);
  await page.getByRole('button', { name: 'Upload and preview' }).click();
  await expect(
    page.getByRole('heading', { name: 'File totals', exact: true }),
  ).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm and activate' }).click();
  await expect(page.getByRole('status')).toContainText('Import activated');
}
test('admin previews, confirms, replaces, rejects a duplicate/bad row, and reverts', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: /Example Freight/ }).click();
  await page.getByRole('link', { name: 'Imports', exact: true }).click();
  await upload(page, 'meta.csv');
  await expect(page.getByText('$10.10', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Reporting start')).toHaveValue('2026-04-01');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/import-preview-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: 'test-results/import-preview.png',
    fullPage: true,
  });
  await confirm(page);
  const first = page.getByRole('row').filter({ hasText: 'meta.csv' });
  await expect(first.getByText('active', { exact: true })).toBeVisible();
  await page.getByLabel('Export file').setInputFiles('fixtures/meta.csv');
  await page.getByRole('button', { name: 'Upload and preview' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Already imported' }),
  ).toBeVisible();
  await upload(page, 'meta-replacement.csv');
  await expect(page.getByText('$20.20', { exact: true })).toBeVisible();
  await expect(page.getByText(/The active meta import/)).toContainText(
    'meta.csv',
  );
  await confirm(page);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'meta.csv' })
      .getByText('superseded'),
  ).toBeVisible();
  await upload(page, 'meta-bad-date.csv');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Validation failed' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm and activate' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel and delete preview' }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'meta.csv' })
    .getByRole('link', { name: 'Review import' })
    .click();
  await page.getByRole('button', { name: 'Revert to this import' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Previous import restored',
  );
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'meta.csv' })
      .getByText('active', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: 'meta.csv' })
    .getByRole('link', { name: 'Review import' })
    .click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download original' }).click();
  expect((await download).suggestedFilename()).toBe('meta.csv');
  await page
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption('sample-transport');
  await expect(page).toHaveURL(/sample-transport\/imports$/);
  await expect(
    page.getByText('No imports yet.', { exact: false }),
  ).toBeVisible();
});
test('signed-out sessions redirect and staff cannot upload or download', async ({
  page,
  request,
}) => {
  await page.goto('/c/example-freight/imports');
  await expect(page).toHaveURL(/sign-in/);
  await login(page);
  await page.goto('/c/example-freight/imports');
  const actionFields = await page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Upload and preview' }) })
    .locator('input[type=hidden]')
    .evaluateAll((inputs) =>
      Object.fromEntries(
        inputs.map((input) => [
          (input as HTMLInputElement).name,
          (input as HTMLInputElement).value,
        ]),
      ),
    );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 'staff');
  await page.goto('/c/example-freight/imports');
  await expect(
    page.getByText('Only administrators can upload', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload and preview' }),
  ).toHaveCount(0);
  const response = await request.get(
    '/c/example-freight/imports/00000000-0000-4000-8000-000000000000/download',
  );
  expect(response.url()).toContain('/sign-in');
  const staffResponse = await page.request.get(
    '/c/example-freight/imports/00000000-0000-4000-8000-000000000000/download',
  );
  expect(staffResponse.status()).toBe(403);
  // Replay an actual admin form directly as staff; hiding the button is insufficient.
  const attemptedUpload = await page.request.post(
    '/c/example-freight/imports',
    {
      headers: { Origin: 'http://127.0.0.1:3001' },
      multipart: {
        ...actionFields,
        source: 'meta',
        file: {
          name: 'forbidden.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('not permitted'),
        },
      },
    },
  );
  expect(attemptedUpload.url()).toContain(
    'error=Administrator%20access%20is%20required.',
  );
});
test('Indeed and DriverHub require explicit metadata confirmation', async ({
  page,
}) => {
  await login(page);
  await page.goto('/c/sample-transport/imports');
  await upload(page, 'Indeed_JobsCampaigns_20260504_20260610.csv');
  await expect(page.getByLabel('Reporting start')).toHaveValue('2026-05-04');
  await expect(page.getByLabel('Reporting end')).toHaveValue('2026-06-10');
  await confirm(page);
  await upload(page, 'driverhub.xlsx');
  await expect(page.getByLabel('Snapshot date', { exact: true })).toHaveValue(
    '2026-06-10',
  );
  await expect(
    page.getByText('Rows needing review', { exact: true }),
  ).toBeVisible();
  await confirm(page);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'driverhub.xlsx' })
      .getByText('3', { exact: true }),
  ).toBeVisible();
});
