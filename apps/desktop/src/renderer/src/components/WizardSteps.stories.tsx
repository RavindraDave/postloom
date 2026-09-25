import type { Meta, StoryObj } from '@storybook/react-vite';
import { WizardSteps } from './WizardSteps';

const meta = {
  title: 'Navigation/WizardSteps',
  component: WizardSteps,
  args: {
    label: 'Setup steps',
    steps: ['Welcome', 'Connect your email', 'Who you are', 'Send yourself a test', 'All set'],
    current: 1,
  },
} satisfies Meta<typeof WizardSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SecondStep: Story = {};
export const LastStep: Story = { args: { current: 4 } };
export const AcrossTheTop: Story = {
  args: {
    label: 'Send steps',
    steps: ['Who to send to', 'Template and sender', 'Check', 'Send'],
    current: 2,
    orientation: 'horizontal',
  },
};
