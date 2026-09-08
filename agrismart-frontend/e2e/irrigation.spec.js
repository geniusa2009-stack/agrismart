import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, VALVE_1, FARM } from './mocks.js';

test.describe('Irrigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('Emergency Stop POSTs to the farm emergency-stop endpoint', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/irrigation');

    await expect(page.getByText(VALVE_1.name).first()).toBeVisible();
    await page.getByRole('button', { name: /Emergency Stop All Valves/ }).click();

    await expect
      .poll(() => calls.some((c) => c.method === 'POST' && c.path === `/irrigation/farms/${FARM._id}/emergency-stop`))
      .toBe(true);
  });

  test('switching to Automatic mode PATCHes automation settings, and manual controls disappear', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/irrigation');

    // Starts in Manual (automationEnabled: false) -> duration + start button visible.
    await expect(page.getByText('Irrigation Duration')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Irrigation' })).toBeVisible();

    await page.getByRole('button', { name: 'Automatic' }).click();

    await expect.poll(() =>
      calls.some((c) => c.method === 'PATCH' && c.path === `/irrigation/valves/${VALVE_1.valveId}/automation`)
    ).toBe(true);

    const call = calls.find((c) => c.method === 'PATCH' && c.path === `/irrigation/valves/${VALVE_1.valveId}/automation`);
    expect(call.body).toEqual({ automationEnabled: true });

    // Manual-only controls are gone; automation settings form appears instead.
    await expect(page.getByText('Irrigation Duration')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Irrigation' })).not.toBeVisible();
    await expect(page.getByText('Automation Settings')).toBeVisible();
  });

  test('manual duration + start/stop only render in Manual mode and fire open/close commands', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/irrigation');

    await page.getByRole('button', { name: '1 min' }).click();
    await page.getByRole('button', { name: 'Start Irrigation' }).click();

    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/irrigation/valves/${VALVE_1.valveId}/open`)).toBe(true);
    const openCall = calls.find((c) => c.method === 'POST' && c.path === `/irrigation/valves/${VALVE_1.valveId}/open`);
    expect(openCall.body).toEqual({ requestedDurationSeconds: 60 });

    // Valve state flips to open server-side; next poll should show "Stop Irrigation".
    await expect(page.getByRole('button', { name: 'Stop Irrigation' })).toBeVisible({ timeout: 6000 });

    await page.getByRole('button', { name: 'Stop Irrigation' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/irrigation/valves/${VALVE_1.valveId}/close`)).toBe(true);
  });

  test('saving automation settings while Automatic PATCHes the numeric fields', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/irrigation');

    await page.getByRole('button', { name: 'Automatic' }).click();
    await expect(page.getByText('Automation Settings')).toBeVisible();

    const openBelow = page.locator('label', { hasText: 'Open below' }).locator('input');
    await openBelow.fill('25');

    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect.poll(() => {
      const saveCalls = calls.filter((c) => c.method === 'PATCH' && c.path === `/irrigation/valves/${VALVE_1.valveId}/automation`);
      return saveCalls.some((c) => c.body?.autoOpenBelowPercent === 25);
    }).toBe(true);

    await expect(page.getByText('Saved.')).toBeVisible();
  });
});
