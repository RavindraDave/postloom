import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 A and AA (PLAN.md §4.3). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Problems axe finds on the page as it is now, one line each (what, and where). */
export async function accessibilityProblems(page: Page): Promise<string[]> {
  // Legacy mode runs in the page itself: Electron can't open the extra blank page axe uses.
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).setLegacyMode(true).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact ?? 'unknown'}): ${node.target.join(' ')}`,
    ),
  );
}

/** Checks the screen as it is now, in light and in dark colours. */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  const found: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    // Let colours settle before contrast is measured.
    await page.waitForTimeout(250);
    found.push(...(await accessibilityProblems(page)).map((line) => `${colorScheme} ${line}`));
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: null });
  expect(found, `Accessibility problems on ${screen}`).toEqual([]);
}
