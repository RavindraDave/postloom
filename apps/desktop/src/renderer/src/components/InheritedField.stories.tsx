import { Button } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { InheritedField } from './InheritedField';

const meta = {
  title: 'Forms/InheritedField',
  component: InheritedField,
  args: {
    label: 'Wait between emails',
    value: '2 seconds',
    source: 'Same as the Office Gmail account',
  },
} satisfies Meta<typeof InheritedField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inherited: Story = {
  args: { action: <Button variant="default">Change for this sender</Button> },
};
export const ReadOnly: Story = {
  args: { label: 'Most emails per day', value: '450', source: 'Gmail allows about 500 a day' },
};
