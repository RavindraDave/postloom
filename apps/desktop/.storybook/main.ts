import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Component catalogue (PLAN.md §4.2): every shared component in light and
 * dark, with the accessibility checker on. `pnpm storybook` to browse.
 */
const config: StorybookConfig = {
  stories: ['../src/renderer/src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
