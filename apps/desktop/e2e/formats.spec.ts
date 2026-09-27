import { expect, test } from './fixtures';

test('shows a detail as money or a long date in the preview', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('radio', { name: /Payment reminder/ }).check();
  await page.getByRole('button', { name: 'Make template' }).click();

  const letter = page.getByRole('textbox', { name: 'Email text' });
  for (const [detail, choice] of [
    ['Amount', '₹1,24,000'],
    ['Due Date', '1 October 2026'],
  ] as const) {
    await letter.locator('.pl-field', { hasText: detail }).click();
    await page.getByRole('button', { name: 'Edit detail' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Show as' }).click();
    await page.getByRole('option', { name: choice, exact: true }).click();
    await dialog.getByRole('button', { name: 'Save detail' }).click();
  }
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByLabel('Amount').fill('12400');
  await page.getByLabel('Due Date').fill('2026-10-01');
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.getByText(/for ₹12,400 is due on 1 October 2026/)).toBeVisible();
});
