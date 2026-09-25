import { ActionIcon, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** A small ⓘ link from a screen to the help article about it. */
export function HelpLink({ topic }: { topic: string }) {
  const { t } = useTranslation();
  const label = t('help.open', { title: t(`helpArticles.${topic}.title`) });
  return (
    <Tooltip label={label}>
      <ActionIcon
        component={Link}
        to={`/help/${topic}`}
        variant="subtle"
        color="gray"
        size="lg"
        aria-label={label}
      >
        <IconHelpCircle size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
