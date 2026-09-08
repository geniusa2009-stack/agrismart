import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, FARM } from './mocks.js';

test.describe('Farm', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('Edit Farm form PATCHes /farms/:id with the new name and location', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/farm');

    await expect(page.locator('main').getByText(FARM.name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).click();

    const nameInput = page.locator('label', { hasText: 'Farm name' }).locator('input');
    await nameInput.fill('Green Valley Farm Renamed');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('main').getByText('Green Valley Farm Renamed')).toBeVisible();

    const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === `/farms/${FARM._id}`);
    expect(patchCall).toBeTruthy();
    expect(patchCall.body.name).toBe('Green Valley Farm Renamed');
  });

  test('Delete Farm DELETEs the farm and a 409 conflict shows as an error, not a crash', async ({ page }) => {
    const { calls } = installApiMocks(page, { deleteFarmShouldConflict: true });
    await page.goto('/farm');

    await page.getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => calls.some((c) => c.method === 'DELETE' && c.path === `/farms/${FARM._id}`)).toBe(true);
    await expect(page.getByText('Farm has active devices and cannot be deleted.')).toBeVisible();
    // Page is still intact / interactive, not crashed.
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('Delete Farm succeeds when unblocked', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/farm');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => calls.some((c) => c.method === 'DELETE' && c.path === `/farms/${FARM._id}`)).toBe(true);

    // No farms left -> the app falls back to the "create your first farm" gate.
    await expect(page.getByText('Create your first farm')).toBeVisible();
  });

  test('Add Farm flow creates a second farm via POST /farms', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/farm');

    await page.getByRole('button', { name: 'Add Farm' }).click();
    await page.getByPlaceholder('Green Valley Farm').fill('Second Farm');
    await page.getByRole('button', { name: 'Create Farm' }).click();

    await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === '/farms')).toBe(true);
    const createCall = calls.find((c) => c.method === 'POST' && c.path === '/farms');
    expect(createCall.body.name).toBe('Second Farm');
  });
});
