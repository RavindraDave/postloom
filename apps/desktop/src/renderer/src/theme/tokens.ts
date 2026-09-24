/**
 * Postloom design tokens: the "Warm studio" direction approved from the
 * design prototype (docs/design/tokens.md). This file is the single source of
 * truth; components use these through the Mantine theme and CSS variables,
 * never as hard-coded values.
 */

/** Deep teal, the one accent colour. Index 7 is the brand primary (#0E6B66). */
export const loom = [
  '#E6F3F1',
  '#CCE7E3',
  '#9FD6CE',
  '#6FC1B6',
  '#45AA9E',
  '#2A958A',
  '#1A8076',
  '#0E6B66',
  '#0A5752',
  '#07433F',
] as const;

export interface SurfaceTokens {
  /** Page background: warm paper. */
  ground: string;
  /** Cards, panels, inputs. */
  surface: string;
  /** Sidebar and segmented-control tracks. */
  sidebar: string;
  /** Hairlines between areas. */
  border: string;
  /** Input and control outlines. */
  control: string;
  /** Main text. */
  ink: string;
  /** Secondary text (≥ 4.5:1 on ground and surface). */
  inkSoft: string;
  /** Captions and hints (≥ 4.5:1 on ground and surface). */
  muted: string;
  /** Selected nav item, focus halo, field chips. */
  accentSoft: string;
  /** Text on accentSoft. */
  accentInk: string;
}

export const light: SurfaceTokens = {
  ground: '#F6F4EF',
  surface: '#FFFFFF',
  sidebar: '#EDE9E0',
  border: '#E3DED3',
  control: '#D6D0C3',
  ink: '#1C1B19',
  inkSoft: '#3D3A35',
  muted: '#6A655C',
  accentSoft: '#E1F0ED',
  accentInk: '#0A4F4B',
};

export const dark: SurfaceTokens = {
  ground: '#151716',
  surface: '#1E2221',
  sidebar: '#191C1B',
  border: '#2E3431',
  control: '#3A413E',
  ink: '#ECE9E2',
  inkSoft: '#C9C4BA',
  muted: '#A9A397',
  accentSoft: '#173A37',
  accentInk: '#9FE0D6',
};

/** Status colours: each pairs a tinted background with a text colour ≥ 4.5:1 on it. */
export const status = {
  light: {
    successBg: '#E3F3EA',
    successInk: '#1F6B45',
    warningBg: '#FDF1DC',
    warningInk: '#7A4F00',
    dangerBg: '#FDECEA',
    dangerInk: '#8F1B12',
  },
  dark: {
    successBg: '#163325',
    successInk: '#7FD6A3',
    warningBg: '#3A2E14',
    warningInk: '#F2C46D',
    dangerBg: '#3A1D1A',
    dangerInk: '#FF9E92',
  },
} as const;

export const fonts = {
  /** Headings: characterful display face. */
  display: '"Bricolage Grotesque Variable", "Segoe UI", system-ui, sans-serif',
  /** Everything else: friendly, very readable. */
  body: '"Figtree Variable", "Segoe UI", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
} as const;

/** Minimum hit target for anything clickable (PLAN.md §4). */
export const MIN_TARGET_PX = 44;
