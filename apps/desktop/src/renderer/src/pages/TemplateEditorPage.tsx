import { Alert, Skeleton, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { errorKey } from '../api/ipc';
import { useTemplate } from '../api/queries';
import { TemplateEditor } from '../editor/TemplateEditor';

export function TemplateEditorPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const template = useTemplate(id);

  if (template.isError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} role="alert" title={t('editor.loadFailed')}>
        {t(errorKey(template.error))}
      </Alert>
    );
  }
  if (!template.data) {
    return (
      <Stack gap="md" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton height={40} radius="md" />
        <Skeleton height={420} radius="lg" />
      </Stack>
    );
  }
  // Keyed by id: opening another template starts a fresh editor.
  return <TemplateEditor key={template.data.id} template={template.data} />;
}
