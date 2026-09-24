import { expect, test } from './fixtures';

// Enforces the Electron hardening baseline (PLAN.md §10.2) against the real,
// built app. A failure here means a security control regressed.

test('the page has no access to Node.js', async ({ page }) => {
  const globals = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    module: typeof (globalThis as Record<string, unknown>)['module'],
    Buffer: typeof (globalThis as Record<string, unknown>)['Buffer'],
  }));
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
  });
});

test('the preload exposes only the typed Postloom API', async ({ page }) => {
  const api = await page.evaluate(() => ({
    top: Object.keys(window.postloom).sort(),
    app: Object.keys(window.postloom.app),
    templates: Object.keys(window.postloom.templates),
    hasIpcRenderer: 'ipcRenderer' in window || 'electron' in window,
  }));
  expect(api).toEqual({
    top: ['app', 'templates'],
    app: ['getInfo'],
    templates: ['renderPreview'],
    hasIpcRenderer: false,
  });
});

test('the content security policy blocks inline scripts and eval', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.head.appendChild(script);
    const response = await fetch('app://postloom/index.html');
    return {
      injected: (window as unknown as Record<string, unknown>)['__injected'] === true,
      policy: response.headers.get('content-security-policy') ?? '',
    };
  });

  expect(result.injected).toBe(false);
  // Playwright's own evaluate() bypasses CSP, so eval is checked via the policy itself.
  expect(result.policy).toContain("script-src 'self'");
  expect(result.policy).not.toContain('unsafe-eval');
  expect(result.policy).not.toMatch(/script-src[^;]*unsafe-inline/);
});

test('the app cannot be navigated to another site', async ({ page }) => {
  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/^app:\/\/postloom\//);
});

test('new windows are denied; only safe links go to the default browser', async ({
  electronApp,
  page,
}) => {
  await electronApp.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as Record<string, unknown>)['__opened'] = opened;
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });

  const results = await page.evaluate(() => [
    window.open('https://example.com/help') === null,
    window.open('file:///etc/passwd') === null,
  ]);

  expect(results).toEqual([true, true]);
  expect(electronApp.windows()).toHaveLength(1);
  const opened = await electronApp.evaluate(
    () => (globalThis as Record<string, unknown>)['__opened'],
  );
  expect(opened).toEqual(['https://example.com/help']);
});

test('permission requests are denied', async ({ page }) => {
  const permission = await page.evaluate(() => Notification.requestPermission());
  expect(permission).toBe('denied');
});

test('the main process validates IPC input', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.postloom.templates.renderPreview({ mjml: 42 } as unknown as { mjml: string }),
  );
  expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
});

test('the app protocol cannot read files outside the app', async ({ page }) => {
  const statuses = await page.evaluate(async () => {
    const paths = [
      'app://postloom/../../../../etc/hostname',
      'app://postloom/%2e%2e/%2e%2e/etc/hostname',
      'app://postloom/..%2f..%2f..%2fetc%2fhostname',
      'app://elsewhere/index.html',
    ];
    return Promise.all(
      paths.map(async (path) => {
        try {
          return (await fetch(path)).status;
        } catch {
          return 'blocked'; // refused before reaching the protocol handler (e.g. by CSP)
        }
      }),
    );
  });
  // Path traversal resolves to "not found"; other hosts are blocked outright.
  expect(statuses).toEqual([404, 404, 404, 'blocked']);
});

test('the email preview runs without scripts or same-origin access', async ({ page }) => {
  await page.getByRole('link', { name: 'Templates' }).click();
  const frame = page.locator('iframe[title="Email preview"]');
  await expect(frame).toHaveAttribute('sandbox', '');

  await page
    .getByLabel('Template source (MJML)')
    .fill(
      '<mjml><mj-body><mj-raw><script>parent.document.title = "pwned"</script></mj-raw><mj-section><mj-column><mj-text>Scripted</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
  await page.getByRole('button', { name: 'Update preview' }).click();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText('Scripted'),
  ).toBeVisible();
  await expect(page).toHaveTitle('Postloom');
});
