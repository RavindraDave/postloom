import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChecklistPanel } from './ChecklistPanel';

const meta = {
  title: 'Editor/ChecklistPanel',
  component: ChecklistPanel,
  args: { problems: [] },
  decorators: [(Story) => <div style={{ maxWidth: 300 }}>{Story()}</div>],
} satisfies Meta<typeof ChecklistPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllGood: Story = {};
export const WithProblems: Story = {
  args: {
    problems: [
      { id: 'subjectLong', severity: 'worthALook', values: { count: 91, limit: 78 } },
      { id: 'buttonLinkExample', severity: 'mustFix', values: { label: 'Pay now' } },
    ],
  },
};
