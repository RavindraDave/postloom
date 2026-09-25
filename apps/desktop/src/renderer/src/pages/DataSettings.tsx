import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { BackupEntry, Preferences } from '@postloom/contracts';
import { IconAlertTriangle, IconDatabaseExport, IconFolderOpen } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import {
  useBackupNow,
  useBackups,
  useClearHistory,
  useOpenDataFolder,
  useRestoreBackup,
} from '../api/queries';
import { formatSize } from './send/CheckStep';

const HISTORY_OPTIONS = [
  { value: '0', key: 'settings.data.historyForever' },
  { value: '30', key: 'settings.data.history30' },
  { value: '90', key: 'settings.data.history90' },
  { value: '365', key: 'settings.data.history365' },
] as const;

/** Backups, the data folder and how long History is kept (Settings → Your data). */
export function DataSettings({
  historyDays,
  onHistoryDays,
}: {
  historyDays: Preferences['historyDays'];
  onHistoryDays: (days: Preferences['historyDays']) => void;
}) {
  const { t, i18n } = useTranslation();
  const backups = useBackups();
  const backupNow = useBackupNow();
  const openFolder = useOpenDataFolder();
  const restore = useRestoreBackup();
  const clear = useClearHistory();
  const [restoring, setRestoring] = useState<BackupEntry | null>(null);
  const [clearing, { open: openClear, close: closeClear }] = useDisclosure(false);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const kind = (value: string) =>
    t(
      value === 'daily'
        ? 'settings.data.kinds.daily'
        : value === 'manual'
          ? 'settings.data.kinds.manual'
          : 'settings.data.kinds.before',
    );
  const error =
    backups.error ?? backupNow.error ?? openFolder.error ?? restore.error ?? clear.error;

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Title order={2} size="h3">
          {t('settings.data.title')}
        </Title>
        <Text c="var(--pl-ink-soft)">{t('settings.data.intro')}</Text>
        {error && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(error))}
          </Alert>
        )}
        <Group>
          <Button
            leftSection={<IconDatabaseExport size={16} />}
            loading={backupNow.isPending}
            onClick={() => {
              backupNow.mutate();
            }}
          >
            {t('settings.data.backupNow')}
          </Button>
          <Button
            variant="default"
            leftSection={<IconFolderOpen size={16} />}
            onClick={() => {
              openFolder.mutate();
            }}
          >
            {t('settings.data.openFolder')}
          </Button>
        </Group>
        {backupNow.isSuccess && (
          <Text size="sm" c="var(--pl-ink-soft)" role="status">
            {t('settings.data.backedUp')}
          </Text>
        )}

        {backups.data?.length === 0 && (
          <Text size="sm" c="var(--pl-muted)">
            {t('settings.data.noBackups')}
          </Text>
        )}
        {backups.data && backups.data.length > 0 && (
          <Table withTableBorder striped aria-label={t('settings.data.backupsLabel')}>
            <Table.Tbody>
              {backups.data.map((backup) => (
                <Table.Tr key={backup.fileName}>
                  <Table.Td>{when(backup.createdAt)}</Table.Td>
                  <Table.Td>{kind(backup.kind)}</Table.Td>
                  <Table.Td c="var(--pl-muted)">{formatSize(backup.sizeBytes)}</Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="xs"
                      variant="subtle"
                      aria-label={`${t('settings.data.restore')} ${when(backup.createdAt)}`}
                      onClick={() => {
                        setRestoring(backup);
                      }}
                    >
                      {t('settings.data.restore')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Title order={3} size="h4" mt="sm">
          {t('settings.data.historyTitle')}
        </Title>
        <Select
          maw={320}
          label={t('settings.data.historyDays')}
          description={t('settings.data.historyHint')}
          allowDeselect={false}
          value={String(historyDays)}
          data={HISTORY_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }))}
          onChange={(value) => {
            if (value) onHistoryDays(Number(value) as Preferences['historyDays']);
          }}
        />
        <Group>
          <Button variant="subtle" color="red" onClick={openClear}>
            {t('settings.data.clearHistory')}
          </Button>
          {clear.data && (
            <Text size="sm" c="var(--pl-ink-soft)" role="status">
              {t('settings.data.cleared', { count: clear.data.deleted })}
            </Text>
          )}
        </Group>
      </Stack>

      <Modal
        opened={restoring !== null}
        onClose={() => {
          setRestoring(null);
        }}
        title={t('settings.data.restoreTitle')}
        centered
      >
        <Stack>
          <Text>
            {t('settings.data.restoreBody', { when: restoring ? when(restoring.createdAt) : '' })}
          </Text>
          <Text size="sm" c="var(--pl-ink-soft)">
            {t('settings.data.restorePasswords')}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setRestoring(null);
              }}
            >
              {t('settings.data.cancel')}
            </Button>
            <Button
              color="red"
              loading={restore.isPending}
              onClick={() => {
                if (!restoring) return;
                restore.mutate(restoring.fileName, {
                  onSettled: () => {
                    setRestoring(null);
                  },
                });
              }}
            >
              {t('settings.data.restoreConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={clearing} onClose={closeClear} title={t('settings.data.clearTitle')} centered>
        <Stack>
          <Text>{t('settings.data.clearBody')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeClear}>
              {t('settings.data.cancel')}
            </Button>
            <Button
              color="red"
              onClick={() => {
                closeClear();
                clear.mutate();
              }}
            >
              {t('settings.data.clearConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
