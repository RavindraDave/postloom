import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import type { Preview } from '@storybook/react-vite';
import '../src/renderer/src/i18n/i18n';
import { cssVariablesResolver, theme } from '../src/renderer/src/theme/theme';

const preview: Preview = {
  globalTypes: {
    scheme: {
      description: 'Light or dark',
      toolbar: { title: 'Scheme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { scheme: 'light' },
  parameters: {
    layout: 'padded',
    // Fail stories with accessibility violations in the test runner.
    a11y: { test: 'error' },
  },
  decorators: [
    (Story, context) => (
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        forceColorScheme={context.globals['scheme'] === 'dark' ? 'dark' : 'light'}
      >
        <div style={{ background: 'var(--pl-ground)', padding: 24, minHeight: '100vh' }}>
          <Story />
        </div>
      </MantineProvider>
    ),
  ],
};

export default preview;
