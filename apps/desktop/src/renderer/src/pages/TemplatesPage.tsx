import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Radio,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { STARTER_GALLERY } from '@postloom/editor';
import { IconAlertTriangle, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorKey } from '../api/ipc';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useEmailPreview,
  useRestoreTemplate,
  useTemplate,
  useTemplates,
} from '../api/queries';
import { EmailPreview, type PreviewDevice } from '../components/EmailPreview';
import { EmptyState } from '../components/EmptyState';
import { FieldChips } from '../components/FieldChips';
import { PageHeader } from '../components/PageHeader';
import classes from './TemplatesPage.module.css';

export function TemplatesPage() {
  const { t } = useTranslation();
  const templates = useTemplates();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const navigate = useNavigate();

  // Show the chosen template, or the most recent one.
  const selectedId = templates.data?.some((tpl) => tpl.id === chosenId)
    ? chosenId
    : (templates.data?.[0]?.id ?? null);

  const newButton = (
    <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
      {t('templates.new')}
    </Button>
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title={t('templates.title')}
        description={t('templates.intro')}
        action={newButton}
      />

      {templates.isPending && (
        <Stack gap="sm" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton height={72} radius="lg" />
          <Skeleton height={72} radius="lg" />
        </Stack>
      )}

      {templates.isError && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(templates.error))}
        </Alert>
      )}

      {templates.data?.length === 0 && (
        <EmptyState
          title={t('templates.emptyTitle')}
          description={t('templates.emptyBody')}
          action={newButton}
        />
      )}

      {templates.data && templates.data.length > 0 && (
        <div className={classes.layout}>
          <nav aria-label={t('templates.listLabel')} className={classes.list}>
            {templates.data.map((template) => (
              <UnstyledButton
                key={template.id}
                className={classes.item}
                data-selected={template.id === selectedId || undefined}
                aria-current={template.id === selectedId ? 'true' : undefined}
                onClick={() => {
                  setChosenId(template.id);
                }}
              >
                <Text fw={650}>{template.name}</Text>
                <Text size="sm" c="var(--pl-muted)" lineClamp={1}>
                  {template.subject}
                </Text>
              </UnstyledButton>
            ))}
          </nav>
          {selectedId && <TemplateDetails id={selectedId} />}
        </div>
      )}

      <NewTemplateModal
        opened={creating}
        onClose={closeCreate}
        onCreated={(id) => {
          closeCreate();
          void navigate(`/templates/${id}`);
        }}
      />
    </Stack>
  );
}

function TemplateDetails({ id }: { id: string }) {
  const { t } = useTranslation();
  const template = useTemplate(id);
  const preview = useEmailPreview(template.data?.document);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const remove = useDeleteTemplate();
  const navigate = useNavigate();
  const restore = useRestoreTemplate();

  if (template.isPending) return <Loader aria-label={t('common.loading')} />;
  if (template.isError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} role="alert">
        {t(errorKey(template.error))}
      </Alert>
    );
  }

  const { name, subject, fields } = template.data;

  const moveToBin = () => {
    remove.mutate(id, {
      onSuccess: () => {
        const notificationId = `deleted-${id}`;
        notifications.show({
          id: notificationId,
          message: (
            <Group justify="space-between" wrap="nowrap">
              <span>{t('templates.deleted', { name })}</span>
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => {
                  restore.mutate(id);
                  notifications.hide(notificationId);
                }}
              >
                {t('common.undo')}
              </Button>
            </Group>
          ),
          autoClose: 8000,
        });
      },
    });
  };

  return (
    <Paper withBorder radius="lg" p="lg" className={classes.details}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4}>
            <Text size="xl" fw={700} ff="var(--pl-font-display)">
              {name}
            </Text>
            <Text c="var(--pl-ink-soft)">
              <Text span c="var(--pl-muted)">
                {t('templates.subject')}:{' '}
              </Text>
              {subject}
            </Text>
          </Stack>
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={18} />}
              onClick={moveToBin}
              loading={remove.isPending}
            >
              {t('templates.delete')}
            </Button>
            <Button
              leftSection={<IconPencil size={18} />}
              onClick={() => void navigate(`/templates/${id}`)}
            >
              {t('templates.edit')}
            </Button>
          </Group>
        </Group>

        {fields.length > 0 && (
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              {t('templates.usesFields')}
            </Text>
            <FieldChips fields={fields} />
          </Stack>
        )}

        <Group justify="space-between">
          <Text fw={600}>{t('templates.previewTitle')}</Text>
          <SegmentedControl
            value={device}
            onChange={(value) => {
              setDevice(value);
            }}
            data={[
              { value: 'desktop', label: t('templates.desktop') },
              { value: 'phone', label: t('templates.phone') },
            ]}
          />
        </Group>
        {preview.data ? (
          <EmailPreview
            html={preview.data.html}
            device={device}
            title={t('templates.previewFrameTitle')}
          />
        ) : (
          <Skeleton height={320} radius="md" />
        )}
      </Stack>
    </Paper>
  );
}

function NewTemplateModal({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTemplate();
  const [starterId, setStarterId] = useState(STARTER_GALLERY[0]?.id ?? 'plainLetter');
  const [name, setName] = useState('');
  const starter = STARTER_GALLERY.find((item) => item.id === starterId) ?? STARTER_GALLERY[0];
  const starterName = starter ? t(`templates.starters.${starter.id}.name`) : '';

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!starter) return;
    create.mutate(
      {
        name: name.trim() || starterName,
        subject: starter.subject,
        category: starter.category,
        document: starter.document,
      },
      {
        onSuccess: (template) => {
          setName('');
          onCreated(template.id);
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('templates.newTitle')}
      centered
      radius="lg"
      size="xl"
    >
      <form onSubmit={submit} noValidate>
        <Stack>
          <Radio.Group
            value={starterId}
            onChange={setStarterId}
            label={t('templates.galleryLabel')}
            description={t('templates.galleryHint')}
          >
            <div className={classes.gallery}>
              {STARTER_GALLERY.map((item) => (
                <Radio.Card
                  key={item.id}
                  value={item.id}
                  radius="lg"
                  className={classes.starter}
                  data-selected={item.id === starterId || undefined}
                >
                  <Text fw={650}>{t(`templates.starters.${item.id}.name`)}</Text>
                  <Text size="sm" c="var(--pl-muted)">
                    {t(`templates.starters.${item.id}.description`)}
                  </Text>
                </Radio.Card>
              ))}
            </div>
          </Radio.Group>
          <TextInput
            label={t('templates.nameLabel')}
            description={t('templates.nameHint')}
            placeholder={starterName}
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
          />
          {create.isError && (
            <Alert color="red" role="alert">
              {t(errorKey(create.error))}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('templates.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
