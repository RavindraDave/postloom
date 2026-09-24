import { app, shell, type Session, type WebContents, type WebPreferences } from 'electron';

/**
 * Security baseline for every window (PLAN.md §10.2). Changing any of these
 * requires an ADR; `security.test.ts` and the E2E security suite enforce them.
 */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    experimentalFeatures: false,
    safeDialogs: true,
  };
}

export const APP_SCHEME = 'app';
export const APP_HOST = 'postloom';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** True if `url` belongs to the app itself (bundled UI, or the dev server in development). */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST) {
    return true;
  }
  if (devServerUrl) {
    return parsed.origin === new URL(devServerUrl).origin;
  }
  return false;
}

/** Only web and email links may be handed to the operating system. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** Denies every permission request (camera, microphone, notifications API, geolocation, ...). */
export function hardenSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
}

/**
 * Blocks navigation away from the app, new windows and <webview> tags. Links
 * to websites open in the user's default browser instead.
 */
export function hardenWebContents(contents: WebContents, devServerUrl?: string): void {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, devServerUrl)) {
      event.preventDefault();
    }
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url, devServerUrl)) {
      event.preventDefault();
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

/** Applies `hardenWebContents` to every web contents the app ever creates. */
export function hardenAllWebContents(devServerUrl?: string): void {
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, devServerUrl));
}
