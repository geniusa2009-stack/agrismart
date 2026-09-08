import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, DEVICE_1, DEVICE_2 } from './mocks.js';

test.describe('Devices', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('Add Device form POSTs to /devices and shows the one-time secret banner', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/devices');

    await expect(page.getByText(`Devices (${2})`)).toBeVisible();

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByPlaceholder('Device name (e.g. ESP32-A002)').fill('ESP32-New');
    await page.getByRole('button', { name: 'Provision Device' }).click();

    await expect(page.getByText('Device secret (shown once)')).toBeVisible();
    await expect(page.getByText('sec_e2e_one_time_secret_abc123')).toBeVisible();

    const createCall = calls.find((c) => c.method === 'POST' && c.path === '/devices');
    expect(createCall).toBeTruthy();
    expect(createCall.body).toMatchObject({ name: 'ESP32-New' });

    // Dismissing the banner removes it.
    await page.locator('.border-amber-200').getByRole('button').click();
    await expect(page.getByText('Device secret (shown once)')).not.toBeVisible();
  });

  test('device search filters the list by name and id', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/devices');

    const row1 = page.getByRole('button', { name: new RegExp(DEVICE_1.name) });
    const row2 = page.getByRole('button', { name: new RegExp(DEVICE_2.name) });
    await expect(row1).toBeVisible();
    await expect(row2).toBeVisible();

    await page.getByPlaceholder('Search devices…').fill('B002');
    await expect(row2).toBeVisible();
    await expect(row1).not.toBeVisible();

    await page.getByPlaceholder('Search devices…').fill('nonexistent-device-xyz');
    await expect(page.getByText('No matches')).toBeVisible();
  });

  test('rename action PATCHes /devices/:id with the new name', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/devices');

    await page.getByRole('button', { name: new RegExp(DEVICE_1.name) }).click();
    await page.getByRole('button', { name: 'settings' }).click();

    const renameInput = page.locator(`input[value="${DEVICE_1.name}"]`);
    await renameInput.fill('ESP32-Renamed');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

    const renameCall = calls.find((c) => c.method === 'PATCH' && c.path === `/devices/${DEVICE_1.deviceId}`);
    expect(renameCall).toBeTruthy();
    expect(renameCall.body).toEqual({ name: 'ESP32-Renamed' });
  });

  test('activate, suspend, rotate-secret, and revoke each fire the correct POST', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/devices');

    await page.getByRole('button', { name: new RegExp(DEVICE_1.name) }).click();
    await page.getByRole('button', { name: 'settings' }).click();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/devices/${DEVICE_1.deviceId}/activate`)).toBe(true);

    await page.getByRole('button', { name: 'Suspend' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/devices/${DEVICE_1.deviceId}/suspend`)).toBe(true);

    await page.getByRole('button', { name: 'Rotate Secret' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/devices/${DEVICE_1.deviceId}/rotate-secret`)).toBe(true);
    await expect(page.getByText('sec_e2e_rotated_secret_xyz789')).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === `/devices/${DEVICE_1.deviceId}/revoke`)).toBe(true);
  });

  test('a failed lifecycle action shows the error message instead of crashing', async ({ page }) => {
    installApiMocks(page, { revokeShouldFail: true });
    await page.goto('/devices');

    await page.getByRole('button', { name: new RegExp(DEVICE_1.name) }).click();
    await page.getByRole('button', { name: 'settings' }).click();
    await page.getByRole('button', { name: 'Revoke' }).click();

    await expect(page.getByText('Could not revoke device.')).toBeVisible();
  });
});
