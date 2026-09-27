import { describe, expect, it, vi } from 'vitest';
import { compareVersions, createUpdateChecker, parseVersion, RELEASES_PAGE } from './updates';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `${RELEASES_PAGE}tag/${tag}`,
  draft: false,
  prerelease: tag.includes('-'),
  ...extra,
});

function checker(currentVersion: string, releases: unknown, overrides = {}) {
  const openExternal = vi.fn(() => Promise.resolve());
  const fetchJson = vi.fn(() =>
    releases instanceof Error ? Promise.reject(releases) : Promise.resolve(releases),
  );
  const updates = createUpdateChecker({
    currentVersion,
    managedByStore: false,
    isEnabled: () => Promise.resolve(true),
    fetchJson,
    openExternal,
    now: () => new Date('2026-09-27T10:00:00Z'),
    ...overrides,
  });
  return { updates, openExternal, fetchJson };
}

const v = (text: string) => {
  const parsed = parseVersion(text);
  if (!parsed) throw new Error(text);
  return parsed;
};

describe('versions', () => {
  it('orders releases and pre-releases the way semantic versioning does', () => {
    const ordered = [
      '0.9.9',
      '1.0.0-beta.1',
      '1.0.0-beta.2',
      '1.0.0-beta.10',
      '1.0.0',
      '1.0.1',
      '1.10.0',
    ];
    for (let i = 1; i < ordered.length; i += 1) {
      expect(compareVersions(v(ordered[i]!), v(ordered[i - 1]!))).toBeGreaterThan(0);
    }
    expect(compareVersions(v('v1.2.3'), v('1.2.3'))).toBe(0);
    expect(parseVersion('latest')).toBeNull();
  });
});

describe('the new-version notice', () => {
  it('reports a newer release and opens only its download page', async () => {
    const { updates, openExternal } = checker('0.1.0', [
      release('v0.1.0'),
      release('v0.2.0'),
      release('v0.3.0', { draft: true }),
    ]);
    expect(await updates.check()).toEqual({
      state: 'available',
      latestVersion: '0.2.0',
      checkedAt: '2026-09-27T10:00:00.000Z',
    });
    await updates.openDownloadPage();
    expect(openExternal).toHaveBeenCalledWith(`${RELEASES_PAGE}tag/v0.2.0`);
  });

  it('offers pre-releases only to people already on one', async () => {
    const releases = [release('v0.1.0'), release('v0.2.0-beta.1')];
    expect((await checker('0.1.0', releases).updates.check()).state).toBe('upToDate');
    expect(await checker('0.1.0-beta.1', releases).updates.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.2.0-beta.1',
    });
  });

  it('ignores a release whose page is anywhere but this project’s releases', async () => {
    const { updates, openExternal } = checker('0.1.0', [
      release('v9.0.0', { html_url: 'https://evil.example/postloom' }),
      release('v8.0.0', {
        html_url: 'http://github.com/RavindraDave/postloom/releases/tag/v8.0.0',
      }),
      { tag_name: 'v7.0.0' },
    ]);
    expect((await updates.check()).state).toBe('upToDate');
    await updates.openDownloadPage();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('says nothing when offline, and tries again later', async () => {
    const { updates } = checker('0.1.0', new Error('offline'));
    expect(await updates.check()).toEqual({
      state: 'unknown',
      latestVersion: null,
      checkedAt: null,
    });
  });

  it('looks at most once a day on its own', async () => {
    const { updates, fetchJson } = checker('0.1.0', [release('v0.1.0')]);
    await updates.checkIfDue();
    await updates.checkIfDue();
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when turned off, and leaves Store installs to the Store', async () => {
    const off = checker('0.1.0', [release('v0.2.0')], { isEnabled: () => Promise.resolve(false) });
    expect((await off.updates.check()).state).toBe('off');
    expect(off.fetchJson).not.toHaveBeenCalled();
    const store = checker('0.1.0', [release('v0.2.0')], { managedByStore: true });
    expect((await store.updates.check()).state).toBe('managedByStore');
    expect(store.fetchJson).not.toHaveBeenCalled();
  });
});
