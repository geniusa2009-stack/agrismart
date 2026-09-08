import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, USER } from './mocks.js';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('Full name form PATCHes /users/me and reflects success', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/settings');

    await expect(page.getByText(USER.email)).toBeVisible();

    const fullNameInput = page.locator('label', { hasText: 'Full name' }).locator('input');
    await fullNameInput.fill('Jane Farmer');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saved.')).toBeVisible();

    const patchCall = calls.find((c) => c.method === 'PATCH' && c.path === '/users/me');
    expect(patchCall).toBeTruthy();
    expect(patchCall.body).toEqual({ fullName: 'Jane Farmer' });
  });

  test('a failed save shows the error message', async ({ page }) => {
    installApiMocks(page);
    await page.route('**/api/v1/users/me', async (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Could not save profile.', code: 'SERVER_ERROR' } }),
        });
      }
      return route.fallback();
    });
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Could not save profile.')).toBeVisible();
  });

  test('Sign out logs the user out back to the login screen', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('AgriSmart', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
