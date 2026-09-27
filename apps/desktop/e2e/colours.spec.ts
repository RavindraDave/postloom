import { expect, test } from './fixtures';

test('colours and highlights words, and sets the inbox preview text', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();

  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Payment overdue');
  // Select "overdue".
  for (let i = 0; i < 'overdue'.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');

  await page.getByRole('button', { name: 'Text colour' }).click();
  await page
    .getByRole('dialog', { name: 'Text colour' })
    .getByRole('button', { name: 'Red', exact: true })
    .click();
  await expect(letter.locator('span[style*="color"]', { hasText: 'overdue' })).toBeVisible();

  await page.getByRole('button', { name: 'Highlight' }).click();
  await page
    .getByRole('dialog', { name: 'Highlight' })
    .getByRole('button', { name: 'Yellow', exact: true })
    .click();
  await expect(letter.locator('mark', { hasText: 'overdue' })).toBeVisible();

  await page.getByRole('button', { name: /Add the line inboxes show/ }).click();
  const previewText = page.getByRole('textbox', { name: 'Preview text' });
  await previewText.click();
  await page.keyboard.type('Please pay by Friday');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(
    preview.locator('span[style*="color:#B42318"]', { hasText: 'overdue' }),
  ).toBeVisible();
  await expect(
    preview.locator('span[style*="background-color:#FFF4A3"]', { hasText: 'overdue' }),
  ).toBeVisible();
  await expect(preview.locator('div[style*="display:none"]').first()).toHaveText(
    'Please pay by Friday',
  );
});
