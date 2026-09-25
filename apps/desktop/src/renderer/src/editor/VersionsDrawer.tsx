import { Button, Drawer, Group, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { TemplateDetail } from '@postloom/contracts';
import { useTranslation } from 'react-i18next';
import { useRestoreVersion, useTemplateVersions } from '../api/queries';

interface VersionsDrawerProps {
  templateId: string;
  opened: boolean;
  onClose: () => void;
  onKeep: () => void;
  keeping: boolean;
  onRestored: (template: TemplateDetail) => void;
}

export function VersionsDrawer({
  templateId,
  opened,
  onClose,
  onKeep,
  keeping,
  onRestored,
}: VersionsDrawerProps) {
  const { t, i18n } = useTranslation();
  const versions = useTemplateVersions(templateId, opened);
  const restore = useRestoreVersion();
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={t('editor.historyTitle')}
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="var(--pl-muted)">
          {t('editor.historyHint')}
        </Text>
        <Button variant="default" loading={keeping} onClick={onKeep}>
          {t('editor.keepVersion')}
        </Button>
        {versions.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
        {versions.data?.length === 0 && (
          <Text size="sm" c="var(--pl-muted)">
            {t('editor.noVersions')}
          </Text>
        )}
        {versions.data?.map((version) => (
          <Group key={version.versionNo} justify="space-between" wrap="nowrap">
            <Stack gap={0}>
              <Text fw={650}>{t('editor.version', { number: version.versionNo })}</Text>
              <Text size="sm" c="var(--pl-muted)">
                {format.format(new Date(version.createdAt))} · {version.subject}
              </Text>
            </Stack>
            <Button
              variant="subtle"
              size="sm"
              loading={restore.isPending && restore.variables.versionNo === version.versionNo}
              onClick={() => {
                restore.mutate(
                  { id: templateId, versionNo: version.versionNo },
                  {
                    onSuccess: (template) => {
                      onRestored(template);
                      notifications.show({
                        message: t('editor.restored', { number: version.versionNo }),
                        color: 'green',
                      });
                    },
                  },
                );
              }}
            >
              {t('editor.restore')}
            </Button>
          </Group>
        ))}
      </Stack>
    </Drawer>
  );
}
