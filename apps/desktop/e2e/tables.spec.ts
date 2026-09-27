import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Pastes into the letter the way a copy from a spreadsheet does. */
async function paste(page: Page, data: Record<string, string>) {
  await page.getByRole('textbox', { name: 'Email text' }).evaluate((element, items) => {
    const clipboard = new DataTransfer();
    for (const [type, value] of Object.entries(items)) clipboard.setData(type, value);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  }, data);
}

// Roughly what Excel puts on the clipboard for three rows of two columns.
const EXCEL_HTML = `<html><head><style>td{mso-number-format:General}</style></head><body>
<table border=0 cellpadding=0 cellspacing=0 width=256>
<col width=160><col width=96>
<tr height=20><td height=20 width=160>Item</td><td width=96>Amount</td></tr>
<tr height=20><td height=20>Design</td><td align=right>₹12,400</td></tr>
<tr height=20><td height=20>Printing</td><td align=right>₹950</td></tr>
</table></body></html>`;

test('pastes a table from Excel and formats it, and the email keeps the look', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();

  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.locator('p').last().click();
  await paste(page, { 'text/html': EXCEL_HTML, 'text/plain': 'Item\tAmount' });

  // Write mode switches to Design, where the table tools are.
  await expect(page.getByText('Switched to Design mode, where the table tools are.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  const table = letter.locator('table');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(table).toContainText('₹12,400');

  // Drag the edge of the first column to make it wider.
  const firstCell = table.locator('td').first();
  const box = await firstCell.boundingBox();
  if (!box) throw new Error('no cell');
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(table.locator('col').first()).toHaveAttribute('style', /width: \d+px/);

  // Header row, grid lines, roomy cells, a coloured header.
  await table.locator('td').first().click();
  await page.getByRole('button', { name: 'Header row' }).click();
  await page.getByRole('button', { name: 'Format table' }).click();
  await page.getByText('Grid', { exact: true }).click();
  await page.getByText('Roomy', { exact: true }).click();
  await page.getByLabel('Header row colour').fill('#0E6B66');
  await page.getByLabel('Line colour').fill('#C9D6E5');
  // The panel shows what the table has.
  await expect(page.getByLabel('Header row colour')).toHaveValue('#0E6B66');
  await expect(page.getByLabel('Line colour')).toHaveValue('#C9D6E5');
  await expect(table).toHaveAttribute('data-borders', 'grid');
  await expect(table).toHaveAttribute('data-spacing', 'roomy');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.frameLocator('iframe[title="Email preview"]');
  const header = preview.locator('th', { hasText: 'Item' });
  await expect(header).toBeVisible();
  const style = (await header.getAttribute('style')) ?? '';
  expect(style).toContain('padding:12px 14px');
  expect(style).toContain('border:1px solid');
  expect(style).toContain('background-color:#0E6B66');
  expect(style).toContain('color:#FFFFFF');
  // The dragged width reaches the email as a share of the table.
  expect(Number((await header.getAttribute('width'))?.replace('%', ''))).toBeGreaterThan(60);
});

test('pastes cells copied as plain text as a table too', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('button', { name: 'Switch to Design' }).click();

  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.locator('p').last().click();
  await paste(page, { 'text/plain': 'Month\tVisits\nJuly\t120\nAugust\t164\n' });

  const table = letter.locator('table');
  await expect(table.locator('th')).toHaveText(['Month', 'Visits']);
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
});
