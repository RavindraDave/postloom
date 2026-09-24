import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string | undefined;
  /** The page's single primary action, shown on the right. */
  action?: ReactNode;
}

/** Title, one-line explanation and the page's main action (docs/design/components.md). */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap" gap="lg">
      <Stack gap={6}>
        <Title order={1}>{title}</Title>
        {description && (
          <Text c="var(--pl-ink-soft)" size="md">
            {description}
          </Text>
        )}
      </Stack>
      {action}
    </Group>
  );
}
