import { Button, Paper, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useOpenDownloadPage, useUpdateStatus } from '../api/queries';

/** A quiet note in the sidebar when a newer version is on the download page. */
export function UpdateNotice() {
  const { t } = useTranslation();
  const status = useUpdateStatus();
  const open = useOpenDownloadPage();
  const version = status.data?.latestVersion;
  if (status.data?.state !== 'available' || !version) return null;

  return (
    <Paper withBorder radius="md" p="sm" mx={4} mb="xs" role="status">
      <Text fw={600} size="sm">
        {t('updates.available', { version })}
      </Text>
      <Text size="xs" c="var(--pl-ink-soft)" mb="xs">
        {t('updates.availableHint')}
      </Text>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconDownload size={14} />}
        aria-label={t('updates.getLabel', { version })}
        onClick={() => {
          open.mutate();
        }}
      >
        {t('updates.get')}
      </Button>
    </Paper>
  );
}
