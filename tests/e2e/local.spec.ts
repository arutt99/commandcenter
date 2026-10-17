import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import path from 'node:path';
const run = promisify(execFile);
test('opens offline without accounts, manages clients, and creates a complete local backup', async ({
  page,
}) => {
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external.push(url.hostname);
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your clients' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Sign in|Sign out|Send invitation/ }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Manage clients' }).click();
  const form = page.locator('form').first();
  await form.getByLabel('Name', { exact: true }).fill('Local Owner Fixture');
  await form.getByLabel('URL slug').fill('local-owner-fixture');
  await form.getByLabel('Brand', { exact: true }).fill('Owner Brand');
  await form.getByRole('button', { name: 'Save client' }).click();
  await expect(page.getByRole('status')).toContainText('Client saved');
  await page.goto('/c/local-owner-fixture/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Local Owner Fixture' }),
  ).toBeVisible();
  await expect(page.locator('header')).toContainText('Owner Brand');
  await page.reload();
  await expect(page.locator('header')).toContainText('Owner Brand');
  await page.getByRole('link', { name: 'Local data & backups' }).click();
  await page.getByRole('button', { name: 'Create backup now' }).click();
  await expect(page.getByRole('status')).toContainText('Backup created');
  await expect(page.getByText('Manual', { exact: true })).toBeVisible();
  expect(external).toEqual([]);
  await page.screenshot({
    path: 'test-results/local-backups.png',
    fullPage: true,
  });
});
test('blocks foreign hosts, cross-origin requests and retired sign-in routes', async ({
  request,
}) => {
  expect(
    (
      await request.get('/', { headers: { Host: 'attacker.example:4311' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get('/', {
        headers: { Origin: 'https://attacker.example' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/admin', {
        headers: { Origin: 'http://127.0.0.1:9999' },
        form: { name: 'Forbidden' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get('/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })
    ).status(),
  ).toBe(403);
  expect((await request.get('/sign-in')).status()).toBe(404);
  expect((await request.get('/auth/callback')).status()).toBe(404);
  expect((await request.get('/store/command-center.sqlite')).status()).toBe(
    404,
  );
  const response = await request.get('/');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['cache-control']).toContain('no-store');
});
test('binds only to loopback and prevents another launcher or offline restore from opening the live store', async () => {
  const env = {
    ...process.env,
    WAYFIND_DATA_DIR: path.resolve('test-results/local-e2e'),
    WAYFIND_PORT: '4312',
  };
  await expect(
    run(
      process.execPath,
      ['--import', 'tsx', 'scripts/launch.ts', '--no-open'],
      { env },
    ),
  ).rejects.toThrow('already running');
  await expect(
    run(
      process.execPath,
      ['--import', 'tsx', 'scripts/restore.ts', 'nonexistent', '--confirm'],
      { env },
    ),
  ).rejects.toThrow('already running');
  const address = Object.values(networkInterfaces())
    .flat()
    .find((info) => info?.family === 'IPv4' && !info.internal)?.address;
  if (address) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: address, port: 4311 });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(1500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    expect(connected).toBe(false);
  }
});
