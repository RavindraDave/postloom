import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { FieldMapInfo, SenderInfo, TemplateDetail } from '@postloom/contracts';
import { renderSubject } from '@postloom/editor';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorKey } from '../../api/ipc';
import { useTemplates } from '../../api/queries';
import type { InspectedList } from './RecipientsStep';
import classes from './SendPage.module.css';

interface TemplateStepProps {
  templateId: string | null;
  senderId: string | null;
  senders: SenderInfo[];
  template: TemplateDetail | undefined;
  headers: string[];
  /** The list inspected with the chosen template (its details matched to columns). */
  inspected: UseQueryResult<InspectedList>;
  fieldMap: FieldMapInfo | null;
  onTemplate: (id: string) => void;
  onSender: (id: string) => void;
  onFieldMap: (fieldMap: FieldMapInfo) => void;
}

/** Step 2: which template, sent as whom, and where each personal detail comes from. */
export function TemplateStep({
  templateId,
  senderId,
  senders,
  template,
  headers,
  inspected,
  fieldMap,
  onTemplate,
  onSender,
  onFieldMap,
}: TemplateStepProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const templates = useTemplates();
  const fields = inspected.data?.fields ?? [];

  return (
    <Stack gap="lg">
      <div className={classes.mappingGrid}>
        {templates.data?.length === 0 ? (
          <Alert color="loom" icon={<IconInfoCircle />} role="note">
            <Stack gap="xs" align="flex-start">
              <Text>{t('send.template.noTemplates')}</Text>
              <Button size="xs" onClick={() => void navigate('/templates')}>
                {t('send.template.makeTemplate')}
              </Button>
            </Stack>
          </Alert>
        ) : (
          <Select
            label={t('send.template.template')}
            placeholder={t('send.template.templatePlaceholder')}
            searchable
            allowDeselect={false}
            value={templateId}
            data={(templates.data ?? []).map((option) => ({
              value: option.id,
              label: option.name,
            }))}
            onChange={(value) => {
              if (value) onTemplate(value);
            }}
          />
        )}
        {senders.length === 0 ? (
          <Alert color="yellow" icon={<IconAlertTriangle />} role="note">
            <Stack gap="xs" align="flex-start">
              <Text>{t('send.template.noSenders')}</Text>
              <Button size="xs" onClick={() => void navigate('/senders')}>
                {t('send.template.addSender')}
              </Button>
            </Stack>
          </Alert>
        ) : (
          <Select
            label={t('send.template.sender')}
            description={t('send.template.senderHint')}
            allowDeselect={false}
            value={senderId}
            data={senders.map((sender) => ({
              value: sender.id,
              label: `${sender.name} <${sender.fromAddress}>`,
            }))}
            onChange={(value) => {
              if (value) onSender(value);
            }}
          />
        )}
      </div>

      {template && (
        <Paper withBorder radius="lg" p="lg">
          <Text size="sm" c="var(--pl-muted)">
            {t('send.template.subject')}
          </Text>
          <Text fw={650}>{renderSubject(template.subject) || template.name}</Text>
        </Paper>
      )}

      {inspected.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(inspected.error))}
        </Alert>
      )}
      {templateId && inspected.isPending && <Loader size="sm" />}

      {inspected.data && fieldMap && (
        <Stack gap="sm">
          <Title order={2} size="h3">
            {t('send.template.detailsTitle')}
          </Title>
          {fields.length === 0 ? (
            <Text c="var(--pl-ink-soft)">{t('send.template.noDetails')}</Text>
          ) : (
            <>
              <Text c="var(--pl-ink-soft)">{t('send.template.detailsBody')}</Text>
              <div className={classes.mappingGrid}>
                {fields.map((field) => (
                  <Select
                    key={field.name}
                    label={
                      <Group gap={6} component="span">
                        <span>{field.name}</span>
                        {field.hasFallback && (
                          <Badge size="sm" variant="light" color="gray" tt="none">
                            {t('send.template.optional')}
                          </Badge>
                        )}
                      </Group>
                    }
                    aria-label={field.name}
                    placeholder={t('send.template.notInList')}
                    clearable
                    value={fieldMap[field.name] ?? null}
                    data={headers}
                    error={!fieldMap[field.name] && !field.hasFallback}
                    onChange={(value) => {
                      onFieldMap({ ...fieldMap, [field.name]: value });
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
