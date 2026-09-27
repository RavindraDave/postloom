import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { appVersion, expect, firstPage, launchApp, test } from './fixtures';

// A release one major version ahead of this build, whatever the build is.
const NEWER = `${String(Number(appVersion.split('.')[0]) + 1)}.0.0`;

const PAGE = `https://github.com/RavindraDave/postloom/releases/tag/v${NEWER}`;

/** A stand-in for GitHub's release list, served locally. */
async function serveReleases(releases: unknown): Promise<{ url: string; server: Server }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(releases));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${String(port)}/releases`, server };
}

test('says when a new version is out, and only ever opens its download page', async ({
  userDataDir,
}) => {
  const { url, server } = await serveReleases([
    { tag_name: `v${NEWER}`, html_url: PAGE, draft: false, prerelease: false },
    { tag_name: 'v9.0.0', html_url: 'https://evil.example/', draft: false, prerelease: false },
  ]);
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_RELEASES_URL: url });
  const page = await firstPage(app);
  // Record what would open in the browser, instead of opening it.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as unknown as { opened: string[] }).opened = opened;
    shell.openExternal = (target: string) => {
      opened.push(target);
      return Promise.resolve();
    };
  });

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Check now' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Postloom ${NEWER} is out` }),
  ).toHaveCount(2);

  // The quiet note in the sidebar.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: `Download Postloom ${NEWER} (opens your browser)` })
    .click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
    .toEqual([PAGE]);

  // Turned off: nothing more is shown.
  await page.getByRole('switch', { name: /Tell me when a new version is out/ }).click();
  await expect(page.getByRole('button', { name: 'Check now' })).toBeHidden();
  await expect(page.getByText(`Postloom ${NEWER} is out`)).toBeHidden();
  await app.close();
  server.close();
});
