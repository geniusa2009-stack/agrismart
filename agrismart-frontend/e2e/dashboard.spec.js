import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, FARM } from './mocks.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('renders stat cards, devices donut, and recent alerts from mocked summary', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

    // Stat cards
    await expect(page.getByText('Soil Moisture', { exact: true })).toBeVisible();
    await expect(page.getByText('42%')).toBeVisible();
    await expect(page.getByText('Temperature', { exact: true })).toBeVisible();
    await expect(page.getByText('24.5°C')).toBeVisible();
    await expect(page.getByText('EC / Salinity', { exact: true })).toBeVisible();

    // Devices overview
    await expect(page.getByText('Devices Overview')).toBeVisible();
    await expect(page.getByText('Total Devices')).toBeVisible();

    // Recent alerts (only unacknowledged ones show)
    await expect(page.getByText('Recent Alerts')).toBeVisible();
    await expect(page.getByText('Low soil moisture', { exact: true })).toBeVisible();
    await expect(page.getByText('Battery low', { exact: true })).toBeVisible();
    // The resolved/acknowledged alert must NOT show in "Recent Alerts".
    await expect(page.getByText('Firmware updated', { exact: true })).not.toBeVisible();
  });

  test('"View All" links use real client-side routing to Devices and Alerts', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/');
    await expect(page.getByText(FARM.name, { exact: true })).toBeVisible();

    const devicesViewAll = page.locator('a', { hasText: 'View All' }).first();
    await expect(devicesViewAll).toHaveAttribute('href', '/devices');
    await devicesViewAll.click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect(page.getByText(/^Devices \(/)).toBeVisible();

    // Navigate to Alerts via its own "View All"
    await page.goBack();
    await expect(page.getByText(FARM.name, { exact: true })).toBeVisible();
    const alertsViewAll = page.locator('a', { hasText: 'View All' }).nth(1);
    await expect(alertsViewAll).toHaveAttribute('href', '/alerts');
    await alertsViewAll.click();
    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  });

  test('shows an EmptyState if the dashboard summary request fails', async ({ page }) => {
    installApiMocks(page);
    // Override the summary route specifically to fail.
    await page.route('**/api/v1/dashboard/farms/*/summary', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Server exploded', code: 'BOOM' } }) })
    );
    await page.goto('/');
    await expect(page.getByText('Could not load dashboard')).toBeVisible();
    await expect(page.getByText('Server exploded')).toBeVisible();
  });
});
