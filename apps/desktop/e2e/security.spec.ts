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
    app: Object.keys(window.postloom.app).sort(),
    settings: Object.keys(window.postloom.settings),
    accounts: Object.keys(window.postloom.accounts).sort(),
    senders: Object.keys(window.postloom.senders).sort(),
    assets: Object.keys(window.postloom.assets).sort(),
    templates: Object.keys(window.postloom.templates).sort(),
    everyEntryIsAFunction: [
      window.postloom.app,
      window.postloom.settings,
      window.postloom.templates,
      window.postloom.accounts,
      window.postloom.senders,
      window.postloom.assets,
    ]
      .flatMap((group): unknown[] => Object.values(group))
      .every((value) => typeof value === 'function'),
    hasIpcRenderer: 'ipcRenderer' in window || 'electron' in window,
  }));
  expect(api).toEqual({
    top: ['accounts', 'app', 'assets', 'senders', 'settings', 'templates'],
    app: ['getInfo', 'getSecurity'],
    settings: ['get', 'update'],
    // No channel ever returns a saved password.
    accounts: ['create', 'delete', 'list', 'sendTestEmail', 'test', 'testConnection', 'update'],
    senders: ['create', 'delete', 'list', 'setBrand', 'update'],
    assets: ['pickImage', 'totalSize'],
    templates: [
      'create',
      'delete',
      'get',
      'list',
      'pickHtml',
      'renderPreview',
      'restore',
      'restoreVersion',
      'save',
      'sendTest',
      'versions',
    ],
    everyEntryIsAFunction: true,
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
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByLabel('Name').fill('Security check');
  await page.getByRole('button', { name: 'Make template' }).click();
  await expect(page.getByRole('textbox', { name: 'Template name' })).toHaveValue('Security check');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Templates' })
    .click();

  const frame = page.locator('iframe[title="Email preview"]');
  await expect(frame).toHaveAttribute('sandbox', '');

  // Simulate hostile email HTML (e.g. from an imported template) reaching the preview.
  const result = await page.evaluate(async () => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Email preview"]');
    if (!iframe) throw new Error('no preview');
    iframe.srcdoc =
      '<p>Scripted</p><script>parent.document.title = "pwned"; window.top.postloom = null;</script>';
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      title: document.title,
      apiStillThere: typeof window.postloom.templates.list === 'function',
      canReachInside: iframe.contentDocument !== null,
    };
  });

  expect(result).toEqual({ title: 'Postloom', apiStillThere: true, canReachInside: false });
  // The hostile document really loaded; its script just couldn't do anything.
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText('Scripted'),
  ).toBeAttached();
});
