import { createTheme } from '@mantine/core';

/**
 * Design tokens (PLAN.md §4.2). Every screen uses these through Mantine;
 * no hard-coded colors or sizes in components.
 */
export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  fontFamily:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSizes: { xs: '13px', sm: '14px', md: '15px', lg: '17px', xl: '20px' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  headings: { fontWeight: '650' },
});
