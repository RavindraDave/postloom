import { expect, test } from './fixtures';

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

test('compiles a template and shows it in the preview', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();

  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.getByText('Hello Asha,')).toBeVisible();

  await page.getByText('Phone', { exact: true }).click();
  await expect(page.locator('iframe[title="Email preview"]')).toBeVisible();
});
