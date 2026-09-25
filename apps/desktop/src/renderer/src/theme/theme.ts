import { createTheme, type CSSVariablesResolver } from '@mantine/core';
import { dark, fonts, light, loom, status, type SurfaceTokens } from './tokens';

/**
 * Mantine theme built from the design tokens (PLAN.md §4.2). Every screen uses
 * these through Mantine; no hard-coded colours or sizes in components.
 */
export const theme = createTheme({
  colors: { loom: [...loom] },
  primaryColor: 'loom',
  // White text on shade 7 is 6.4:1, so the same shade works in both schemes.
  primaryShade: { light: 7, dark: 7 },
  autoContrast: true,
  fontFamily: fonts.body,
  fontFamilyMonospace: fonts.mono,
  // rem, so the Settings text size scales everything.
  fontSizes: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem', lg: '1.0625rem', xl: '1.25rem' },
  defaultRadius: 'md',
  radius: { sm: '8px', md: '10px', lg: '14px', xl: '20px' },
  cursorType: 'pointer',
  // Honour the computer's "reduce motion" setting (PLAN.md §4.3).
  respectReducedMotion: true,
  focusRing: 'auto',
  headings: {
    fontFamily: fonts.display,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '2.125rem', lineHeight: '1.1' },
      h2: { fontSize: '1.375rem', lineHeight: '1.2' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.3' },
    },
  },
  components: {
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    // Cards and panels sit on the warm ground as surfaces.
    Paper: { styles: { root: { backgroundColor: 'var(--pl-surface)' } } },
    Card: { styles: { root: { backgroundColor: 'var(--pl-surface)' } } },
  },
});

type StatusTokens = (typeof status)['light'] | (typeof status)['dark'];

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function schemeVariables(
  tokens: SurfaceTokens,
  statusTokens: StatusTokens,
): Record<string, string> {
  const own = Object.fromEntries(
    [...Object.entries(tokens), ...Object.entries(statusTokens)].map(([key, value]) => [
      `--pl-${kebab(key)}`,
      value,
    ]),
  );
  return {
    ...own,
    '--mantine-color-body': tokens.ground,
    '--mantine-color-text': tokens.ink,
    '--mantine-color-dimmed': tokens.muted,
    '--mantine-color-default': tokens.surface,
    '--mantine-color-default-border': tokens.control,
  };
}

/** Surface, text and status colours as CSS variables (`--pl-*`), per colour scheme. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--pl-font-display': fonts.display,
    '--pl-min-target': '44px',
  },
  light: schemeVariables(light, status.light),
  dark: schemeVariables(dark, status.dark),
});
