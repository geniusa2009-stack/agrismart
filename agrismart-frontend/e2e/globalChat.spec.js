import { test, expect } from '@playwright/test';
import { installApiMocks, seedAuthToken, seedLocale } from './mocks.js';

// Covers the global AI farm assistant (GlobalChatWidget.jsx / POST
// /api/v1/ai/chat) — spec section 22's frontend-observable scenarios.
// Gemini itself is never called: mocks.js's installApiMocks fully
// intercepts /api/v1/** and returns a canned, honest chatResponse.

test.describe('Global AI chat assistant', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthToken(page);
  });

  test('the floating trigger is available on the Dashboard and opens the chat panel with the welcome state', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Ask AgriSmart' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByRole('dialog', { name: 'AgriSmart Assistant' })).toBeVisible();
    await expect(page.getByText('Hi there 👋')).toBeVisible();
    await expect(page.getByText("I'm the AgriSmart assistant.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Should I irrigate?' })).toBeVisible();
  });

  test('the same global trigger is reachable from a completely different page (Community) — one globally mounted component', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/community');
    await expect(page.getByRole('button', { name: 'Ask AgriSmart' })).toBeVisible();
  });

  test('sending a message shows the real structured answer (answer/why/next step), never a raw provider response', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await page.getByRole('button', { name: 'Should I irrigate?' }).click();

    await expect(page.getByText('Irrigation is not needed right now.')).toBeVisible();
    await expect(page.getByText('Soil moisture is adequate')).toBeVisible();
    await expect(page.getByText('Keep monitoring soil moisture over the next couple of hours.')).toBeVisible();
  });

  test('a page-specific quick action appears on the Irrigation page and is not the generic set alone', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/irrigation');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await expect(page.getByRole('button', { name: 'Should I irrigate now?' })).toBeVisible();
  });

  test('when the assistant flags an irrigation-execution request, it offers safe navigation instead of executing anything', async ({ page }) => {
    installApiMocks(page, {
      chatResponse: {
        status: 'available',
        answer: 'Starting irrigation needs your confirmation from the Irrigation screen.',
        reasons: [],
        nextStep: 'Open the irrigation page and confirm.',
        intents: { irrigationExecutionRequested: true, equipmentIntent: false, communityIntent: false },
        confidence: 'medium',
        limitations: [],
        source: 'gemini',
      },
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await page.getByRole('button', { name: 'Should I irrigate?' }).click();

    const openIrrigation = page.getByRole('button', { name: 'Open irrigation page' });
    await expect(openIrrigation).toBeVisible();
    await openIrrigation.click();
    await expect(page).toHaveURL(/\/irrigation$/);
  });

  test('an equipment intent offers a real navigation button to the rental experience', async ({ page }) => {
    installApiMocks(page, {
      chatResponse: {
        status: 'available',
        answer: 'We can help you find agricultural equipment.',
        reasons: [],
        nextStep: 'Open equipment rental and pick a date and duration.',
        intents: { irrigationExecutionRequested: false, equipmentIntent: true, communityIntent: false },
        confidence: 'high',
        limitations: [],
        source: 'gemini',
      },
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await page.getByRole('button', { name: "How's my field?" }).click();

    const openEquipment = page.getByRole('button', { name: 'Rent equipment' });
    await expect(openEquipment).toBeVisible();
    await openEquipment.click();
    await expect(page).toHaveURL(/\/equipment$/);
  });

  test('an unavailable/insufficient-data status shows the fixed honest message, never a fabricated answer', async ({ page }) => {
    installApiMocks(page, { chatResponse: { status: 'unavailable' } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await page.getByRole('button', { name: 'Should I irrigate?' }).click();

    await expect(page.getByText('The smart assistant is not available right now.')).toBeVisible();
  });

  test('Egyptian farmer mode shows the shorter Egyptian button/welcome labels', async ({ page }) => {
    await seedLocale(page, 'ar-eg');
    installApiMocks(page);
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'اسأل المساعد' })).toBeVisible();
    await page.getByRole('button', { name: 'اسأل المساعد' }).click();
    await expect(page.getByText('أهلاً بيك 👋')).toBeVisible();
  });

  test('General Arabic mode renders RTL and the general-Arabic button label', async ({ page }) => {
    await seedLocale(page, 'ar');
    installApiMocks(page);
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'اسأل AgriSmart' })).toBeVisible();
    await page.getByRole('button', { name: 'اسأل AgriSmart' }).click();
    await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
  });

  test('English mode renders LTR', async ({ page }) => {
    await seedLocale(page, 'en');
    installApiMocks(page);
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('button', { name: 'Ask AgriSmart' })).toBeVisible();
  });

  test('closing the panel and reopening preserves nothing sensitive beyond this session (clear conversation control is present)', async ({ page }) => {
    installApiMocks(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask AgriSmart' }).click();
    await page.getByRole('button', { name: 'Should I irrigate?' }).click();
    await expect(page.getByText('Irrigation is not needed right now.')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Clear conversation' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(page.getByText('Hi there 👋')).toBeVisible();
  });
});
