import type { Page } from '@playwright/test';
import { expect, firstPage, launchApp, test } from './fixtures';

async function createTemplate(page: Page, name: string) {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Make template' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

test('opens on the Home screen with the getting-started checklist', async ({ page }) => {
  await expect(page).toHaveTitle('Postloom');
  await expect(page.getByRole('heading', { name: 'Welcome to Postloom' })).toBeVisible();
  await expect(page.getByText('Connect your email')).toBeVisible();
  await expect(page.getByTestId('app-version')).toContainText('Version 0.1.0');
});

test('navigates between sections from the sidebar', async ({ page }) => {
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
});

test('makes a template and shows a readable preview', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(page.getByText('No templates yet')).toBeVisible();

  await createTemplate(page, 'Thank you note');

  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.getByText('Dear [First Name],')).toBeVisible();
  await expect(page.getByText('Details it uses from your list')).toBeVisible();

  await page.getByText('Phone', { exact: true }).click();
  await expect(page.locator('iframe[title="Email preview"]')).toBeVisible();
});

test('keeps templates and settings after a restart', async ({ electronApp, page, userDataDir }) => {
  await createTemplate(page, 'Payment reminder');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
  await electronApp.close();

  const again = await launchApp(userDataDir);
  try {
    const reopened = await firstPage(again);
    await expect(reopened.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
    await reopened.getByRole('link', { name: 'Templates' }).click();
    await expect(reopened.getByRole('button', { name: /Payment reminder/ })).toBeVisible();
  } finally {
    await again.close();
  }
});

test('moves a template to the bin and brings it back', async ({ page }) => {
  await createTemplate(page, 'Office notice');
  await page.getByRole('button', { name: 'Move to bin' }).click();
  await expect(page.getByText('No templates yet')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Office notice/ })).toBeVisible();
});
