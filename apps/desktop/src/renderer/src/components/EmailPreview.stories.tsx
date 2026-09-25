import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmailPreview } from './EmailPreview';

const html =
  '<div style="font-family:Arial;padding:24px"><h2>Hi [First Name],</h2><p>Your invoice is ready.</p></div>';

const meta = {
  title: 'Data/EmailPreview',
  component: EmailPreview,
  args: { html, title: 'Email preview', device: 'desktop' },
} satisfies Meta<typeof EmailPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Computer: Story = {};
export const Phone: Story = { args: { device: 'phone' } };
