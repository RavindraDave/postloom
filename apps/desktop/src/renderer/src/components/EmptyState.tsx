import { Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** "Nothing here yet": loom illustration, one sentence, one action. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Stack
      align="center"
      justify="center"
      gap="sm"
      p="xl"
      ta="center"
      bg="var(--pl-surface)"
      style={{ border: '1px solid var(--pl-border)', borderRadius: 16 }}
    >
      <svg width="96" height="64" viewBox="0 0 96 64" fill="none" aria-hidden>
        <g stroke="var(--mantine-color-loom-7)" strokeWidth={2.4} strokeLinecap="round">
          <path d="M6 14h84" strokeOpacity={0.35} />
          <path d="M6 32h84" />
          <path d="M6 50h84" strokeOpacity={0.35} />
          <path d="M24 4v56" strokeDasharray="9 9" />
          <path d="M48 4v56" strokeDasharray="9 9" strokeDashoffset={9} />
          <path d="M72 4v56" strokeDasharray="9 9" />
        </g>
      </svg>
      <Title order={2} size="h3">
        {title}
      </Title>
      <Text c="var(--pl-ink-soft)" maw={360}>
        {description}
      </Text>
      {action}
    </Stack>
  );
}
