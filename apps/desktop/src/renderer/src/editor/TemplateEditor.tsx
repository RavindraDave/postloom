import {
  Alert,
  Anchor,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { TemplateDetail } from '@postloom/contracts';
import {
  checkTemplate,
  collectFields,
  fromEditorJson,
  SUBJECT_SOFT_LIMIT,
  type WriteDocument,
} from '@postloom/editor';
import { toEditorContent, writeModeExtensions } from '@postloom/editor/tiptap';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDots,
  IconEye,
  IconHistory,
  IconSend,
} from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { errorKey } from '../api/ipc';
import { useEmailPreview, useSaveTemplate, useSenders, useSendTemplateTest } from '../api/queries';
import { EmailPreview, type PreviewDevice } from '../components/EmailPreview';
import { ChecklistPanel } from './ChecklistPanel';
import { ButtonDialog, DetailDialog, LinkDialog, type ButtonValue } from './EditorDialogs';
import { EditorToolbar } from './EditorToolbar';
import { InsertDetailMenu } from './InsertDetailMenu';
import classes from './TemplateEditor.module.css';
import { VersionsDrawer } from './VersionsDrawer';

/** Autosave waits this long after the last change. */
export const AUTOSAVE_DELAY_MS = 800;

type Dialog = 'link' | 'button' | 'editButton' | 'detail' | 'editDetail' | null;

/** Write mode (design: DesignerWrite): a letter-like editor that saves as you type. */
export function TemplateEditor({ template }: { template: TemplateDetail }) {
  const { t } = useTranslation();
  const save = useSaveTemplate();
  const senders = useSenders();
  const sendTest = useSendTemplateTest();

  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [document, setDocument] = useState<WriteDocument>(template.document);
  const [senderId, setSenderId] = useState(template.defaultSenderProfileId);
  const [invalid, setInvalid] = useState(false);
  const [extraFields, setExtraFields] = useState<string[]>([]);
  // Each change bumps `revision`; autosave catches `savedRevision` up to it.
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [previewOpen, preview] = useDisclosure(false);
  const [historyOpen, history] = useDisclosure(false);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const editor = useEditor({
    extensions: writeModeExtensions,
    content: toEditorContent(template.document),
    editorProps: {
      attributes: {
        'aria-label': t('editor.bodyLabel'),
        'aria-multiline': 'true',
        role: 'textbox',
        class: classes.prose ?? '',
      },
    },
    onUpdate: ({ editor: current }) => {
      try {
        setDocument(fromEditorJson(current.getJSON()));
        setInvalid(false);
        setRevision((value) => value + 1);
      } catch {
        setInvalid(true);
      }
    },
  });

  const changed = () => {
    setRevision((value) => value + 1);
  };

  // What gets saved: the latest values, read by autosave and on leaving.
  const latest = useRef({ name, subject, document, revision, savedRevision });
  useLayoutEffect(() => {
    latest.current = { name, subject, document, revision, savedRevision };
  });

  const buildSave = () => {
    const current = latest.current;
    return {
      id: template.id,
      ...(current.name.trim() && { name: current.name.trim() }),
      subject: current.subject,
      document: current.document,
    };
  };

  const saveNow = async () => {
    const target = latest.current.revision;
    if (target === latest.current.savedRevision) return;
    await save.mutateAsync(buildSave());
    setSavedRevision((value) => Math.max(value, target));
  };

  useEffect(() => {
    if (revision === savedRevision || invalid) return;
    const timer = window.setTimeout(() => {
      void saveNow().catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // saveNow reads the latest values through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, savedRevision, invalid]);

  // Leaving the editor never loses typing: save straight away.
  useEffect(
    () => () => {
      const current = latest.current;
      if (current.revision !== current.savedRevision) {
        void window.postloom.templates.save(buildSave());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [previewDocument] = useDebouncedValue(document, 400);
  const previewResult = useEmailPreview(previewDocument);
  const htmlBytes = previewResult.data
    ? new TextEncoder().encode(previewResult.data.html).length
    : undefined;
  const problems = useMemo(
    () => checkTemplate({ subject, document, htmlBytes }),
    [subject, document, htmlBytes],
  );
  const fields = useMemo(
    () => [...new Set([...collectFields(document), ...extraFields])],
    [document, extraFields],
  );

  const status: 'saved' | 'saving' | 'unsaved' | 'error' | 'invalid' = invalid
    ? 'invalid'
    : save.isPending
      ? 'saving'
      : revision === savedRevision
        ? 'saved'
        : save.isError
          ? 'error'
          : 'unsaved';

  const insertField = (fieldName: string, fallback = '') => {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'field', attrs: { name: fieldName, fallback } })
      .run();
  };

  const selectedAttrs = (type: 'button' | 'field') =>
    editor.isActive(type) ? (editor.getAttributes(type) as Record<string, string>) : undefined;
  const selectedButton = selectedAttrs('button');
  const selectedField = selectedAttrs('field');

  const closeDialog = () => {
    setDialog(null);
  };

  const senderOptions = (senders.data ?? []).map((sender) => ({
    value: sender.id,
    label: `${sender.fromName} <${sender.fromAddress}>`,
  }));

  return (
    <Stack gap="md" className={classes.page}>
      {/* Top bar: back, name + save status, actions */}
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Group gap="sm" wrap="nowrap" className={classes.titleGroup}>
          <Anchor component={RouterLink} to="/templates" size="sm" className={classes.back}>
            <IconArrowLeft size={16} aria-hidden /> {t('editor.back')}
          </Anchor>
          <TextInput
            aria-label={t('editor.nameLabel')}
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.currentTarget.value);
              changed();
            }}
            variant="unstyled"
            classNames={{ input: classes.nameInput }}
          />
          <Text
            size="sm"
            c={
              status === 'error' || status === 'invalid'
                ? 'var(--pl-danger-ink)'
                : 'var(--pl-muted)'
            }
            role="status"
            data-testid="save-status"
            className={classes.status}
          >
            {t(`editor.status.${status}`)}
          </Text>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Button variant="default" leftSection={<IconEye size={18} />} onClick={preview.open}>
            {t('editor.preview')}
          </Button>
          <Button
            leftSection={<IconSend size={18} />}
            disabled={!senderId}
            loading={sendTest.isPending}
            onClick={() => {
              if (!senderId) return;
              void saveNow()
                .then(() => sendTest.mutateAsync({ id: template.id, senderId }))
                .then(({ sentTo }) => {
                  notifications.show({
                    message: t('editor.testSent', { address: sentTo }),
                    color: 'green',
                  });
                })
                .catch(() => undefined);
            }}
          >
            {t('editor.sendTest')}
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="subtle" color="gray" px="xs" aria-label={t('editor.more')}>
                <IconDots size={18} />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconHistory size={16} />} onClick={history.open}>
                {t('editor.history')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {!senderId && (
        <Text size="sm" c="var(--pl-muted)" ta="right" mt={-8}>
          {t('editor.chooseSenderFirst')}
        </Text>
      )}
      {sendTest.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(sendTest.error))}
        </Alert>
      )}

      <div className={classes.layout}>
        <Stack gap="md" className={classes.writing}>
          <TextInput
            label={t('editor.subjectLabel')}
            description={t('editor.subjectHint', {
              count: subject.length,
              limit: SUBJECT_SOFT_LIMIT,
            })}
            value={subject}
            maxLength={200}
            onChange={(event) => {
              setSubject(event.currentTarget.value);
              changed();
            }}
          />
          <EditorToolbar
            editor={editor}
            onLink={() => {
              setDialog('link');
            }}
            onButton={() => {
              setDialog('button');
            }}
            onEditButton={() => {
              setDialog('editButton');
            }}
            onEditDetail={() => {
              setDialog('editDetail');
            }}
            insertDetail={
              <InsertDetailMenu
                fields={fields}
                onInsert={(fieldName) => {
                  insertField(fieldName);
                }}
                onNew={() => {
                  setDialog('detail');
                }}
              />
            }
          />
          {/* Not a themed Paper: the letter always looks like the (light) email. */}
          <div className={classes.paper}>
            <EditorContent editor={editor} />
          </div>
        </Stack>

        <Stack gap="md" className={classes.side}>
          <ChecklistPanel problems={problems} />
          <Paper withBorder p="md" radius="lg" component="section" aria-label={t('editor.from')}>
            <Title order={2} size="h5" mb={4}>
              {t('editor.from')}
            </Title>
            {senders.data?.length === 0 ? (
              <Text size="sm" c="var(--pl-muted)">
                {t('editor.noSenders')}
              </Text>
            ) : (
              <Select
                aria-label={t('editor.from')}
                description={t('editor.fromHint')}
                placeholder={t('editor.fromPlaceholder')}
                data={senderOptions}
                value={senderId}
                onChange={(value) => {
                  setSenderId(value);
                  save.mutate({ id: template.id, defaultSenderProfileId: value });
                }}
              />
            )}
          </Paper>
          <Paper p="md" radius="lg" bg="var(--pl-accent-soft)" component="section">
            <Text fw={700} size="sm">
              {t('editor.designTitle')}
            </Text>
            <Text size="sm" mt={4}>
              {t('editor.designBody')}
            </Text>
            <Text size="sm" mt="xs" fw={600} c="var(--pl-accent-ink)">
              {t('editor.designSoon')}
            </Text>
          </Paper>
        </Stack>
      </div>

      <LinkDialog
        opened={dialog === 'link'}
        onClose={closeDialog}
        onSave={(href) => {
          editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
          closeDialog();
        }}
      />
      <ButtonDialog
        opened={dialog === 'button' || dialog === 'editButton'}
        onClose={closeDialog}
        initial={
          dialog === 'editButton' && selectedButton
            ? ({
                label: selectedButton['label'] ?? '',
                href: selectedButton['href'] ?? '',
              } satisfies ButtonValue)
            : undefined
        }
        onSave={(value) => {
          if (dialog === 'editButton') {
            editor.chain().focus().updateAttributes('button', value).run();
          } else {
            editor.chain().focus().insertContent({ type: 'button', attrs: value }).run();
          }
          closeDialog();
        }}
      />
      <DetailDialog
        opened={dialog === 'detail' || dialog === 'editDetail'}
        onClose={closeDialog}
        initial={
          dialog === 'editDetail' && selectedField
            ? { name: selectedField['name'] ?? '', fallback: selectedField['fallback'] ?? '' }
            : undefined
        }
        onSave={(value) => {
          if (dialog === 'editDetail') {
            editor.chain().focus().updateAttributes('field', { fallback: value.fallback }).run();
          } else {
            setExtraFields((current) => [...current, value.name]);
            insertField(value.name, value.fallback);
          }
          closeDialog();
        }}
      />

      <Modal
        opened={previewOpen}
        onClose={preview.close}
        title={t('editor.previewTitle')}
        size="auto"
      >
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="var(--pl-muted)">
              {t('editor.previewHint')}
            </Text>
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
          {previewResult.data && (
            <EmailPreview
              html={previewResult.data.html}
              device={device}
              title={t('templates.previewFrameTitle')}
            />
          )}
        </Stack>
      </Modal>

      <VersionsDrawer
        templateId={template.id}
        opened={historyOpen}
        onClose={history.close}
        keeping={save.isPending}
        onKeep={() => {
          void saveNow()
            .then(() => save.mutateAsync({ id: template.id, snapshot: true }))
            .then(() => {
              notifications.show({ message: t('editor.versionKept'), color: 'green' });
            })
            .catch(() => undefined);
        }}
        onRestored={(restored) => {
          editor.commands.setContent(toEditorContent(restored.document), { emitUpdate: false });
          setDocument(restored.document);
          setSubject(restored.subject);
          setName(restored.name);
          setSavedRevision(revision);
        }}
      />
    </Stack>
  );
}
