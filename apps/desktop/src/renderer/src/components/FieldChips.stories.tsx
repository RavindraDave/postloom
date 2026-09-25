import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldChips } from './FieldChips';

const meta = {
  title: 'Data/FieldChips',
  component: FieldChips,
  args: { fields: ['First Name', 'Invoice No', 'Amount', 'Due Date'] },
} satisfies Meta<typeof FieldChips>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
