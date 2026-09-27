import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { makeDocx } from './docx';

test('designs with columns and a show-only-if part, previewed with example details', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('button', { name: 'Switch to Design' }).click();
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();

  const letter = page.getByRole('textbox', { name: 'Email text' });

  // Two columns, with words in each.
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('menuitem', { name: 'Two columns' }).click();
  const columns = letter.locator('.pl-column');
  await expect(columns).toHaveCount(2);
  await columns.nth(0).click();
  await page.keyboard.type('Opening hours');
  await columns.nth(1).click();
  await page.keyboard.type('Find us');

  // A part only people on the Gold plan see.
  await letter.locator(':scope > p').last().click();
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('menuitem', { name: 'Show only if…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Show this part only to some people' });
  await dialog.getByRole('combobox', { name: /^Detail/ }).fill('Plan');
  await dialog.getByRole('button', { name: 'Add part' }).click();
  const part = letter.locator('[data-conditional]');
  await expect(part).toContainText('Shown only if Plan has a value');
  await part.locator('p').click();
  await page.keyboard.type('Thanks for being a member');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // The preview decides the part from example details.
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.getByText('Opening hours')).toBeVisible();
  await expect(preview.getByText('Thanks for being a member')).toBeVisible();
  await page.getByLabel('First Name').fill('Rahul');
  await expect(preview.getByText('Dear Rahul,')).toBeVisible();
  await expect(preview.getByText('Thanks for being a member')).toHaveCount(0);
  await page.getByLabel('Plan').fill('Gold');
  await expect(preview.getByText('Thanks for being a member')).toBeVisible();
});

test('imports an HTML email as a template', async ({ userDataDir }) => {
  const file = join(userDataDir, 'spring.html');
  writeFileSync(
    file,
    `<html><head><title>Spring news</title><script>window.hacked = true</script></head>
     <body><h1>Spring is here</h1><p>New flowers <a href="https://shop.example.org">in store</a>.</p>
     <table><tr><th>Flower</th><th>Price</th></tr><tr><td>Tulip</td><td>3</td></tr></table>
     <img src="https://tracker.example/pixel.gif"></body></html>`,
  );
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_PICK_HTML: file });
  const page = await firstPage(app);

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'More template options' }).click();
  await page.getByRole('menuitem', { name: 'Import an HTML email or Word document…' }).click();

  await expect(page.getByRole('textbox', { name: 'Template name' })).toHaveValue('Spring news');
  await expect(page.getByText(/1 picture from the file wasn't brought in/)).toBeVisible();
  // It has a table, so it opens in Design mode.
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  const letter = page.getByRole('textbox', { name: 'Email text' });
  await expect(letter.getByRole('heading', { name: 'Spring is here' })).toBeVisible();
  await expect(letter.locator('table')).toContainText('Tulip');
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false);

  await app.close();
});

test('imports a Word document with its picture and details', async ({ userDataDir }) => {
  const file = join(userDataDir, 'Invoice letter.docx');
  writeFileSync(file, makeDocx());
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_PICK_HTML: file });
  const page = await firstPage(app);

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'More template options' }).click();
  await page.getByRole('menuitem', { name: 'Import an HTML email or Word document…' }).click();

  await expect(page.getByRole('textbox', { name: 'Template name' })).toHaveValue('Invoice letter');
  await expect(
    page.getByText(/These became personal details: First Name, Invoice No/),
  ).toBeVisible();
  const letter = page.getByRole('textbox', { name: 'Email text' });
  await expect(letter.getByRole('img', { name: 'Company logo' })).toBeVisible();
  await expect(letter.locator('table')).toContainText('Tulips');

  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByLabel('First Name').fill('Asha');
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.getByText('Dear Asha,')).toBeVisible();

  await app.close();
});
