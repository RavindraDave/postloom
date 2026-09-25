import { Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface InheritedFieldProps {
  label: string;
  value: string;
  /** Where the value comes from, e.g. "Same as the Office Gmail account". */
  source: string;
  /** "Change for this sender", "Lower it", … */
  action?: ReactNode;
}

/** A setting that may come from somewhere else, and says where (docs/design/components.md). */
export function InheritedField({ label, value, source, action }: InheritedFieldProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="lg" py="xs">
      <Stack gap={2}>
        <Text fw={650}>{label}</Text>
        <Text size="sm" c="var(--pl-muted)">
          {source}
        </Text>
      </Stack>
      <Group gap="md" wrap="nowrap">
        <Text fw={650} ff="var(--pl-font-display)" size="lg">
          {value}
        </Text>
        {action}
      </Group>
    </Group>
  );
}
