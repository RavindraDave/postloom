import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <Stack maw={760}>
      <Title order={1}>{t(titleKey)}</Title>
      <Text c="dimmed">{t('placeholder.body')}</Text>
    </Stack>
  );
}
