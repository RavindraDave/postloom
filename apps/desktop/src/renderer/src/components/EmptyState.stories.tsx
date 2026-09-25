import { Button } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: {
    title: 'No sends yet',
    description: "When you send emails, you'll see who got what, and when, right here.",
    action: <Button>Send your first emails</Button>,
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
