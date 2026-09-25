import { Group } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusPill } from './StatusPill';

const meta = {
  title: 'Status/StatusPill',
  component: StatusPill,
  args: { tone: 'success', children: 'Working' },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Working: Story = {};
export const AllTones: Story = {
  render: () => (
    <Group>
      <StatusPill tone="success">Working</StatusPill>
      <StatusPill tone="warning">Almost at today's limit</StatusPill>
      <StatusPill tone="danger">Needs you</StatusPill>
      <StatusPill tone="neutral">Not checked yet</StatusPill>
    </Group>
  ),
};
