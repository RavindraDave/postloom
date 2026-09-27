import {
  Alert,
  Anchor,
  Button,
  Group,
  Switch,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { Preferences } from '@postloom/contracts';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { errorKey } from '../api/ipc';
import {
  useAppInfo,
  useCheckForUpdate,
  useOpenDownloadPage,
  usePreferences,
  useUpdatePreferences,
  useUpdateStatus,
} from '../api/queries';
import { PageHeader } from '../components/PageHeader';
import { DataSettings } from './DataSettings';
import { SendingDefaults } from './SendingDefaults';

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
            <SendingDefaults preferences={preferences.data} onChange={change} />
          </Paper>

          <DataSettings
            historyDays={preferences.data.historyDays}
            onHistoryDays={(historyDays) => {
              change({ historyDays });
            }}
          />

          <About
            checkForUpdates={preferences.data.checkForUpdates}
            onCheckForUpdates={(checkForUpdates) => {
              change({ checkForUpdates });
            }}
          />
        </>
      )}
    </Stack>
  );
}

/** Who makes Postloom (opens in the browser). */
const PUBLISHER_URL = 'https://r2dsolutions.com';

/** Settings → About: the version and who makes it, for when someone asks. */
function About({
  checkForUpdates,
  onCheckForUpdates,
}: {
  checkForUpdates: boolean;
  onCheckForUpdates: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const info = useAppInfo();
  const status = useUpdateStatus();
  const check = useCheckForUpdate();
  const open = useOpenDownloadPage();
  const state = status.data?.state;
  const version = status.data?.latestVersion;
  // Nothing to say until there has been a look (a failed first look says so once asked).
  const message =
    state === 'available' && version
      ? t('updates.available', { version })
      : state === 'upToDate'
        ? t('updates.upToDate')
        : state === 'unknown' && (status.data?.checkedAt || check.isSuccess)
          ? t('updates.unknown')
          : '';

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="sm" align="flex-start">
        <Title order={2} size="h3">
          {t('settings.about')}
        </Title>
        {info.data && <Text fw={600}>{t('settings.version', { version: info.data.version })}</Text>}
        <Text size="sm" c="var(--pl-ink-soft)">
          {t('settings.publisher')}{' '}
          <Anchor href={PUBLISHER_URL} target="_blank" aria-label={t('settings.publisherLink')}>
            R2DSolutions
          </Anchor>
        </Text>
        <Text c="var(--pl-ink-soft)">{t('settings.aboutBody')}</Text>

        {state === 'managedByStore' ? (
          <Text size="sm" c="var(--pl-ink-soft)">
            {t('updates.store')}
          </Text>
        ) : (
          <>
            <Switch
              size="md"
              checked={checkForUpdates}
              onChange={(event) => {
                onCheckForUpdates(event.currentTarget.checked);
              }}
              label={t('updates.setting')}
              description={t('updates.settingHint')}
            />
            {checkForUpdates && (
              <Group gap="sm">
                <Button
                  variant="default"
                  size="xs"
                  loading={check.isPending}
                  onClick={() => {
                    check.mutate();
                  }}
                >
                  {t('updates.checkNow')}
                </Button>
                <Text size="sm" c="var(--pl-ink-soft)" role="status">
                  {message}
                </Text>
                {state === 'available' && version && (
                  <Button
                    size="xs"
                    aria-label={t('updates.getLabel', { version })}
                    onClick={() => {
                      open.mutate();
                    }}
                  >
                    {t('updates.get')}
                  </Button>
                )}
              </Group>
            )}
          </>
        )}

        <Button component={Link} to="/help" variant="default">
          {t('settings.openHelp')}
        </Button>
      </Stack>
    </Paper>
  );
}
