import {
  Alert,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import type { Preferences } from '@postloom/contracts';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import { usePreferences, useUpdatePreferences } from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { DataSettings } from './DataSettings';

const TEXT_SCALES = [
  { value: '1', key: 'settings.textNormal' },
  { value: '1.15', key: 'settings.textLarger' },
  { value: '1.3', key: 'settings.textLargest' },
] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const update = useUpdatePreferences();

  const change = (changes: Partial<Preferences>) => {
    update.mutate(changes);
  };

  return (
    <Stack gap="lg" maw={720}>
      <PageHeader
        helpTopic="your-data"
        title={t('nav.settings')}
        description={t('settings.intro')}
      />

      {update.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(update.error))}
        </Alert>
      )}

      {!preferences.data ? (
        <Skeleton height={220} radius="lg" />
      ) : (
        <>
          <Paper withBorder radius="lg" p="lg">
            <Stack gap="lg">
              <Title order={2} size="h3">
                {t('settings.appearance')}
              </Title>
              <Stack gap={6}>
                <Text fw={600} id="scheme-label">
                  {t('settings.colorScheme')}
                </Text>
                <SegmentedControl
                  aria-labelledby="scheme-label"
                  value={preferences.data.colorScheme}
                  onChange={(value) => {
                    change({ colorScheme: value });
                  }}
                  data={[
                    { value: 'auto', label: t('settings.schemeAuto') },
                    { value: 'light', label: t('settings.schemeLight') },
                    { value: 'dark', label: t('settings.schemeDark') },
                  ]}
                />
              </Stack>
              <Stack gap={6}>
                <Text fw={600} id="text-label">
                  {t('settings.textSize')}
                </Text>
                <SegmentedControl
                  aria-labelledby="text-label"
                  value={String(preferences.data.textScale)}
                  onChange={(value) => {
                    change({ textScale: Number(value) });
                  }}
                  data={TEXT_SCALES.map((scale) => ({ value: scale.value, label: t(scale.key) }))}
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Stack gap="md">
              <Title order={2} size="h3">
                {t('settings.sending')}
              </Title>
              <Switch
                size="md"
                checked={preferences.data.confirmBeforeSend}
                onChange={(event) => {
                  change({ confirmBeforeSend: event.currentTarget.checked });
                }}
                label={t('settings.confirmBeforeSend')}
                description={t('settings.confirmBeforeSendHint')}
              />
            </Stack>
          </Paper>

          <DataSettings
            historyDays={preferences.data.historyDays}
            onHistoryDays={(historyDays) => {
              change({ historyDays });
            }}
          />
        </>
      )}
    </Stack>
  );
}
