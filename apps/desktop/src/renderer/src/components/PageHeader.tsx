import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { HelpLink } from './HelpLink';

interface PageHeaderProps {
  title: string;
  description?: string | undefined;
  /** The page's single primary action, shown on the right. */
  action?: ReactNode;
  /** A help article about this screen, linked with an ⓘ next to the title. */
  helpTopic?: string | undefined;
}

/** Title, one-line explanation and the page's main action (docs/design/components.md). */
export function PageHeader({ title, description, action, helpTopic }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap" gap="lg">
      <Stack gap={6}>
        <Group gap="xs" wrap="nowrap">
          <Title order={1}>{title}</Title>
          {helpTopic && <HelpLink topic={helpTopic} />}
        </Group>
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
