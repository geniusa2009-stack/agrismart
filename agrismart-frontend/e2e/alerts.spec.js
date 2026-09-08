import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, ALERT_OPEN, ALERT_WARNING, ALERT_RESOLVED } from './mocks.js';

test.describe('Alerts', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('filter tabs switch between all / severities / resolved', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/alerts');

    // "all" shows unacknowledged alerts only.
    await expect(page.getByText(ALERT_OPEN.title, { exact: true })).toBeVisible();
    await expect(page.getByText(ALERT_WARNING.title, { exact: true })).toBeVisible();
    await expect(page.getByText(ALERT_RESOLVED.title, { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: 'critical', exact: true }).click();
    await expect(page.getByText(ALERT_OPEN.title, { exact: true })).toBeVisible();
    await expect(page.getByText(ALERT_WARNING.title, { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: 'warning', exact: true }).click();
    await expect(page.getByText(ALERT_WARNING.title, { exact: true })).toBeVisible();
    await expect(page.getByText(ALERT_OPEN.title, { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: 'resolved', exact: true }).click();
    await expect(page.getByText(ALERT_RESOLVED.title, { exact: true })).toBeVisible();
    await expect(page.getByText(ALERT_OPEN.title, { exact: true })).not.toBeVisible();
    await expect(page.getByText(ALERT_WARNING.title, { exact: true })).not.toBeVisible();
  });

  test('Resolve calls the acknowledge endpoint with the colon-containing id encoded', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/alerts');

    const row = page.locator('div.bg-slate-50', { hasText: ALERT_OPEN.title }).last();
    await row.getByRole('button', { name: 'Resolve' }).click();

    const expectedEncoded = encodeURIComponent(ALERT_OPEN.id);
    await expect.poll(() =>
      calls.some((c) => c.method === 'POST' && c.url.includes(`/alerts/${expectedEncoded}/acknowledge`))
    ).toBe(true);

    // The URL Playwright saw must contain the percent-encoded colon, not a raw one.
    const ackCall = calls.find((c) => c.method === 'POST' && c.path.includes('/acknowledge'));
    expect(ackCall.url).toContain(expectedEncoded);
    expect(ALERT_OPEN.id).toContain(':');
    expect(expectedEncoded).not.toContain(':');

    // UI reflects resolution: the alert leaves the "all" (unresolved) view.
    await expect(page.getByText(ALERT_OPEN.title, { exact: true })).not.toBeVisible();
  });

  test('Reopen calls the unacknowledge (DELETE) endpoint from the resolved tab', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/alerts');

    await page.getByRole('button', { name: 'resolved', exact: true }).click();
    const row = page.locator('div.bg-slate-50', { hasText: ALERT_RESOLVED.title }).last();
    await row.getByRole('button', { name: 'Reopen' }).click();

    const expectedEncoded = encodeURIComponent(ALERT_RESOLVED.id);
    await expect.poll(() =>
      calls.some((c) => c.method === 'DELETE' && c.url.includes(`/alerts/${expectedEncoded}/acknowledge`))
    ).toBe(true);

    // It leaves the resolved tab once reopened.
    await expect(page.getByText(ALERT_RESOLVED.title, { exact: true })).not.toBeVisible();
  });
});
