import { Button, Menu, Text } from '@mantine/core';
import { IconChevronDown, IconPlus, IconUserCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface InsertDetailMenuProps {
  fields: string[];
  onInsert: (name: string) => void;
  onNew: () => void;
}

/** "Insert detail ▾": adds a personal detail from the list as a chip. */
export function InsertDetailMenu({ fields, onInsert, onNew }: InsertDetailMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu position="bottom-start" width={280} shadow="md">
      <Menu.Target>
        <Button
          variant="light"
          size="sm"
          leftSection={<IconUserCircle size={18} />}
          rightSection={<IconChevronDown size={14} />}
        >
          {t('editor.insertDetail')}
        </Button>
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
