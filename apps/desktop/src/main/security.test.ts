import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { on: vi.fn() }, shell: { openExternal: vi.fn() } }));

const { isAppUrl, isSafeExternalUrl, secureWebPreferences, hardenWebContents } =
  await import('./security');
const { contentSecurityPolicy, devContentSecurityPolicy } = await import('./csp');
const { shell } = await import('electron');

describe('secureWebPreferences', () => {
  it('keeps the renderer isolated from Node and the operating system', () => {
    expect(secureWebPreferences('/preload.cjs')).toMatchObject({
      preload: '/preload.cjs',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });
});

describe('isAppUrl', () => {
  it('accepts the bundled app origin only', () => {
    expect(isAppUrl('app://postloom/index.html')).toBe(true);
    expect(isAppUrl('app://evil/index.html')).toBe(false);
    expect(isAppUrl('https://postloom.example.com')).toBe(false);
    expect(isAppUrl('file:///etc/passwd')).toBe(false);
    expect(isAppUrl('not a url')).toBe(false);
  });

  it('accepts the dev server origin only when one is configured', () => {
    expect(isAppUrl('http://localhost:5173/#/home', 'http://localhost:5173')).toBe(true);
    expect(isAppUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
    expect(isAppUrl('http://localhost:5173/')).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it.each([
    ['https://support.google.com/accounts', true],
    ['http://example.com', true],
    ['mailto:help@example.com', true],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['smb://attacker/share', false],
    ['ms-msdt:/id', false],
    ['', false],
  ])('%s -> %s', (url, expected) => {
    expect(isSafeExternalUrl(url)).toBe(expected);
  });
});

describe('hardenWebContents', () => {
  function fakeContents() {
    const listeners = new Map<
      string,
      (event: { preventDefault: () => void }, url: string) => void
    >();
    let windowOpenHandler: ((details: { url: string }) => { action: string }) | undefined;
    const contents = {
      on: (
        name: string,
        listener: (event: { preventDefault: () => void }, url: string) => void,
      ) => {
        listeners.set(name, listener);
      },
      setWindowOpenHandler: (handler: typeof windowOpenHandler) => {
        windowOpenHandler = handler;
      },
    };
    return { contents, listeners, open: (url: string) => windowOpenHandler!({ url }) };
  }

  it('blocks navigation away from the app', () => {
    const { contents, listeners } = fakeContents();
    hardenWebContents(contents as never);

    const external = { preventDefault: vi.fn() };
    listeners.get('will-navigate')!(external, 'https://attacker.example');
    expect(external.preventDefault).toHaveBeenCalled();

    const internal = { preventDefault: vi.fn() };
    listeners.get('will-navigate')!(internal, 'app://postloom/index.html#/templates');
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it('never opens new windows and sends only safe links to the browser', () => {
    const { contents, open } = fakeContents();
    hardenWebContents(contents as never);

    expect(open('https://example.com')).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');

    vi.mocked(shell.openExternal).mockClear();
    expect(open('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('content security policy', () => {
  it('allows scripts from the app bundle only', () => {
    expect(contentSecurityPolicy).toContain("script-src 'self'");
    expect(contentSecurityPolicy).not.toContain('unsafe-eval');
    expect(contentSecurityPolicy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(contentSecurityPolicy).toContain("object-src 'none'");
  });

  it('only loosens scripts for the local dev server', () => {
    expect(devContentSecurityPolicy).toMatch(/script-src 'self' 'unsafe-inline'/);
    expect(devContentSecurityPolicy).not.toContain('unsafe-eval');
  });
});
