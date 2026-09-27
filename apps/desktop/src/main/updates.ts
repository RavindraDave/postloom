import type { UpdateStatus } from '@postloom/contracts';
import { z } from 'zod';

/** Where new versions are published (decision D10). */
export const RELEASES_API =
  'https://api.github.com/repos/RavindraDave/postloom/releases?per_page=20';
/** Only pages under this address are ever opened. */
export const RELEASES_PAGE = 'https://github.com/RavindraDave/postloom/releases/';

const DAY_MS = 24 * 60 * 60 * 1000;

const releaseSchema = z.object({
  tag_name: z.string().max(64),
  html_url: z.string().max(512),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

interface Version {
  core: [number, number, number];
  pre: string[];
}

/** Reads "1.2.3" or "v1.2.3-beta.4"; null for anything else. */
export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

/** Semantic-version order: positive when a is newer than b. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // A release is newer than any of its pre-releases (1.0.0 > 1.0.0-beta.2).
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum && Number(x) !== Number(y)) return Number(x) - Number(y);
    if (xNum !== yNum) return xNum ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface UpdateCheckDeps {
  currentVersion: string;
  /** Installed from the Microsoft Store, which keeps the app up to date itself. */
  managedByStore: boolean;
  isEnabled: () => Promise<boolean>;
  /** Fetches a URL and returns its JSON (tests fake it). */
  fetchJson: (url: string) => Promise<unknown>;
  /** Opens a web page in the person's browser. */
  openExternal: (url: string) => Promise<void>;
  releasesApi?: string;
  now?: () => Date;
}

/**
 * Tells people when a newer Postloom is on the download page. It never
 * downloads or runs anything: it only reads the list of releases and, when
 * asked, opens that release's page in the browser (security/review-1.0.md).
 * Pre-releases are offered only to people already on one.
 */
export function createUpdateChecker(deps: UpdateCheckDeps) {
  const now = deps.now ?? (() => new Date());
  const current = parseVersion(deps.currentVersion);
  let latest: { version: string; url: string } | null = null;
  let checkedAt: Date | null = null;
  let failed = false;

  const status = async (): Promise<UpdateStatus> => {
    if (deps.managedByStore)
      return { state: 'managedByStore', latestVersion: null, checkedAt: null };
    if (!(await deps.isEnabled())) return { state: 'off', latestVersion: null, checkedAt: null };
    return {
      state: latest ? 'available' : failed || !checkedAt ? 'unknown' : 'upToDate',
      latestVersion: latest?.version ?? null,
      checkedAt: checkedAt?.toISOString() ?? null,
    };
  };

  const check = async (): Promise<UpdateStatus> => {
    if (deps.managedByStore || !current || !(await deps.isEnabled())) return status();
    try {
      const releases = z
        .array(z.unknown())
        .parse(await deps.fetchJson(deps.releasesApi ?? RELEASES_API));
      let best: { version: Version; name: string; url: string } | null = null;
      for (const item of releases) {
        const release = releaseSchema.safeParse(item);
        if (!release.success || release.data.draft) continue;
        if (release.data.prerelease && current.pre.length === 0) continue;
        // Only a page in this project's releases, over HTTPS, is ever opened.
        if (!release.data.html_url.startsWith(RELEASES_PAGE)) continue;
        const version = parseVersion(release.data.tag_name);
        if (!version) continue;
        if (!best || compareVersions(version, best.version) > 0) {
          best = {
            version,
            name: release.data.tag_name.replace(/^v/, ''),
            url: release.data.html_url,
          };
        }
      }
      latest =
        best && compareVersions(best.version, current) > 0
          ? { version: best.name, url: best.url }
          : null;
      checkedAt = now();
      failed = false;
    } catch {
      // Offline, rate-limited or an unexpected answer: say nothing, try again later.
      failed = true;
    }
    return status();
  };

  return {
    status,
    check,
    /** Checks if the last look was over a day ago (called at start-up). */
    checkIfDue: async () => {
      if (checkedAt && now().getTime() - checkedAt.getTime() < DAY_MS) return status();
      return check();
    },
    openDownloadPage: async () => {
      if (!latest) return;
      await deps.openExternal(latest.url);
    },
  };
}

export type UpdateChecker = ReturnType<typeof createUpdateChecker>;
