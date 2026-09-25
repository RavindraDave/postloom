import { Button } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Layout/PageHeader',
  component: PageHeader,
  args: { title: 'Templates', description: 'Reusable emails you can send again and again.' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAction: Story = { args: { action: <Button>New template</Button> } };
export const TitleOnly: Story = { args: { description: undefined } };
