import { test, expect } from '@playwright/test';
import { installApiMocks, FARM } from './mocks.js';

test.describe('Login', () => {
  test('renders the login form with prefilled demo credentials', async ({ page }) => {
    installApiMocks(page); // no token seeded -> loadSession short-circuits, Login renders
    await page.goto('/');

    await expect(page.getByText('AgriSmart', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue('demo-farmer@agrismart.local');
    await expect(page.getByLabel('Password')).toHaveValue('DemoPassword123!');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('successful login posts credentials and lands on the dashboard', async ({ page }) => {
    const { calls } = installApiMocks(page);
    await page.goto('/');

    await page.getByLabel('Email').fill('demo-farmer@agrismart.local');
    await page.getByLabel('Password').fill('DemoPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Dashboard renders once /users/me + /farms + summary all resolve.
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Demo Farmer/ })).toBeVisible();
    await expect(page.getByText(FARM.name, { exact: true })).toBeVisible();

    const loginCall = calls.find((c) => c.path === '/auth/login' && c.method === 'POST');
    expect(loginCall).toBeTruthy();
    expect(loginCall.body).toEqual({ email: 'demo-farmer@agrismart.local', password: 'DemoPassword123!' });

    expect(calls.some((c) => c.method === 'GET' && c.path === '/users/me')).toBe(true);
    expect(calls.some((c) => c.method === 'GET' && c.path === '/farms')).toBe(true);
  });

  test('failed login shows the server error message inline and stays on the login screen', async ({ page }) => {
    installApiMocks(page, { loginShouldFail: true });
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    // Still on the login screen.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
