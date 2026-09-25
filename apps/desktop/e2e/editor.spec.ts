import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';
import { makePng } from './png';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

test('writes a template from the gallery, saves as you type, and sends a real test', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const env = { POSTLOOM_TEST_EXTRA_CA_FILE: caFile };

  let app = await launchApp(userDataDir, env);
  let page = await firstPage(app);

  // Connect an account and sender first (quick path through setup).
  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();
  await page.getByLabel('Your email address').fill(ADDRESS);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  // Start from the "Thank you" starter.
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('radio', { name: /Thank you/ }).check();
  await page.getByRole('button', { name: 'Make template' }).click();
  await expect(page.getByRole('textbox', { name: 'Template name' })).toHaveValue('Thank you');

  // Write: add a line with a personal detail.
  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Your order number is ');
  await page.getByRole('button', { name: 'Insert detail', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New detail…' }).click();
  await page.getByLabel('Column name in your list').fill('Order No');
  await page.getByRole('button', { name: 'Add detail' }).click();
  await expect(letter.locator('.pl-field', { hasText: 'Order No' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // Choose who it's from, then send a real test.
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: /Asha Kapoor/ }).click();
  await page.getByRole('button', { name: 'Send me a test' }).click();
  await expect(page.getByText(`Test sent to ${ADDRESS}`)).toBeVisible();
  expect(mail.received).toHaveLength(1);
  expect(mail.received[0]?.raw).toContain('Subject: [Test] Thank you!');
  expect(mail.received[0]?.raw).toContain('[Order No]');
  expect(mail.received[0]?.raw).not.toContain('{{');

  // Everything is still there after a restart.
  await app.close();
  app = await launchApp(userDataDir, env);
  page = await firstPage(app);
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Email text' }).locator('.pl-field', { hasText: 'Order No' }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'From' })).toHaveValue(/Asha Kapoor/);

  await app.close();
  await mail.close();
});

test('adds a picture and a brand logo that arrive inside the test email', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const pictureFile = join(userDataDir, 'shop.png');
  writeFileSync(pictureFile, makePng(80, 40, [14, 107, 102]));
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_EXTRA_CA_FILE: caFile,
    POSTLOOM_TEST_PICK_IMAGE: pictureFile,
  });
  const page = await firstPage(app);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();
  await page.getByLabel('Your email address').fill(ADDRESS);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  // Give the sender a brand look with a logo.
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  const brand = page.getByRole('region', { name: 'Brand look' });
  await brand.getByRole('button', { name: 'Add a brand look' }).click();
  await brand.getByRole('button', { name: 'Choose logo' }).click();
  await expect(brand.getByRole('img', { name: 'Logo' })).toBeVisible();
  await brand.getByRole('button', { name: 'Save brand look' }).click();
  await expect(page.getByText('Brand look saved')).toBeVisible();

  // Write a template with a picture and a detail in the subject.
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: /Asha Kapoor/ }).click();
  await page.getByRole('button', { name: 'Insert detail in the subject' }).click();
  await page.getByRole('menuitem', { name: 'First Name' }).click();

  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.click();
  await page.keyboard.press('Control+End');
  await page.getByRole('button', { name: 'Picture' }).click();
  await page.getByLabel(/Describe the picture/).fill('Our shop');
  await page.getByRole('button', { name: 'Add picture' }).click();

  // The app serves the stored picture to the editor.
  const picture = letter.getByRole('img', { name: 'Our shop' });
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Send me a test' }).click();
  await expect(page.getByText(`Test sent to ${ADDRESS}`)).toBeVisible();
  const raw = mail.received[0]?.raw ?? '';
  expect(raw).toContain('Subject: [Test] A note from us[First Name]');
  expect(raw).toContain('multipart/related');
  expect(raw).toContain('Content-Type: image/png');
  // One stored picture used as the logo and in the letter travels once.
  expect(raw.match(/Content-ID: </g)).toHaveLength(1);
  expect(raw).toMatch(/src=3D"cid:[A-Za-z0-9-]+@postloom"|src="cid:[A-Za-z0-9-]+@postloom"/);

  await app.close();
  await mail.close();
});
