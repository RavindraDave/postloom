import { Badge, Group } from '@mantine/core';

/** Spreadsheet columns a template uses, shown as chips. */
export function FieldChips({ fields }: { fields: string[] }) {
  return (
    <Group gap={6}>
      {fields.map((field) => (
        <Badge
          key={field}
          variant="light"
          radius="xl"
          size="lg"
          tt="none"
          fw={650}
          styles={{ root: { background: 'var(--pl-accent-soft)', color: 'var(--pl-accent-ink)' } }}
        >
          {field}
        </Badge>
      ))}
    </Group>
  );
}
