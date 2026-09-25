import { ActionIcon, Button, Menu, Text } from '@mantine/core';
import { IconChevronDown, IconPlus, IconUserCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface InsertDetailMenuProps {
  fields: string[];
  onInsert: (name: string) => void;
  onNew: () => void;
  /** Accessible name when it differs from the visible "Insert detail". */
  label?: string;
  /** An icon-only button (the subject line). */
  compact?: boolean;
}

/** "Insert detail ▾": adds a personal detail from the list as a chip. */
export function InsertDetailMenu({
  fields,
  onInsert,
  onNew,
  label,
  compact = false,
}: InsertDetailMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu position="bottom-start" width={280} shadow="md">
      <Menu.Target>
        {compact ? (
          <ActionIcon variant="light" size="lg" aria-label={label ?? t('editor.insertDetail')}>
            <IconUserCircle size={18} />
          </ActionIcon>
        ) : (
          <Button
            variant="light"
            size="sm"
            aria-label={label}
            leftSection={<IconUserCircle size={18} />}
            rightSection={<IconChevronDown size={14} />}
          >
            {t('editor.insertDetail')}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('editor.detailsFromList')}</Menu.Label>
        {fields.length === 0 && (
          <Text size="sm" c="var(--pl-muted)" px="sm" py={4}>
            {t('editor.noDetailsYet')}
          </Text>
        )}
        {fields.map((name) => (
          <Menu.Item
            key={name}
            onClick={() => {
              onInsert(name);
            }}
          >
            {name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item leftSection={<IconPlus size={16} />} onClick={onNew}>
          {t('editor.newDetail')}
        </Menu.Item>
        <Text size="xs" c="var(--pl-muted)" px="sm" py={6}>
          {t('editor.detailsHint')}
        </Text>
      </Menu.Dropdown>
    </Menu>
  );
}
