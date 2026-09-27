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
  emailAssetIds,
  fromEditorJson,
  lookFromBrand,
  MAX_IMAGE_WIDTH,
  MAX_LOGO_WIDTH,
  renderSubject,
  subjectFields,
  tableFromTabbedText,
  TEXT_SIZES,
  usesDesignBlocks,
  withTemplateLook,
  type DetailFormat,
  type TemplateLook,
  type WriteDocument,
} from '@postloom/editor';
import { APP_ASSET_URL_PREFIX, toEditorContent } from '@postloom/editor/tiptap';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDots,
  IconEye,
  IconHistory,
  IconSend,
} from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { errorKey } from '../api/ipc';
import {
  useEmailPreview,
  useImagesSize,
  usePickImage,
  useSaveTemplate,
  useSenders,
  useSendTemplateTest,
} from '../api/queries';
import { EmailPreview, type PreviewDevice } from '../components/EmailPreview';
import { ChecklistPanel } from './ChecklistPanel';
import { TemplateLookPanel } from './TemplateLookPanel';
import {
  ButtonDialog,
  DetailDialog,
  LinkDialog,
  PictureDialog,
  type ButtonValue,
  type PictureValue,
} from './EditorDialogs';
import { EditorToolbar } from './EditorToolbar';
import { editorExtensions } from './ConditionView';
import { DesignTools } from './DesignTools';
import { insertBlock } from './insertBlock';
import { InsertDetailMenu } from './InsertDetailMenu';
import { RuleDialog, type RuleValue } from './RuleDialog';
import { SignatureContext } from './SignatureView';
import { SubjectInput } from './SubjectInput';
import classes from './TemplateEditor.module.css';
import { VersionsDrawer } from './VersionsDrawer';

/** Autosave waits this long after the last change. */
export const AUTOSAVE_DELAY_MS = 800;

type Dialog =
  | 'link'
  | 'button'
  | 'editButton'
  | 'detail'
  | 'editDetail'
  | 'picture'
  | 'editPicture'
  | 'rule'
  | 'editRule'
  | null;

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
  const [mode, setMode] = useState(template.editorMode);
  // Read by the editor's update handler, which is set up once.
  const modeRef = useRef(mode);
  useLayoutEffect(() => {
    modeRef.current = mode;
  });
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [extraFields, setExtraFields] = useState<string[]>([]);
  // Each change bumps `revision`; autosave catches `savedRevision` up to it.
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [previewOpen, preview] = useDisclosure(false);
  const [historyOpen, history] = useDisclosure(false);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Until the person has clicked into the letter, new things go at the end.
  const bodyTouched = useRef(false);
  const editor = useEditor({
    extensions: editorExtensions,
    content: toEditorContent(template.document),
    editorProps: {
      attributes: {
        'aria-label': t('editor.bodyLabel'),
        'aria-multiline': 'true',
        role: 'textbox',
        class: classes.prose ?? '',
      },
      // Cells copied as plain text (tab-separated) become a table. Spreadsheets
      // that also give HTML (Excel, Google Sheets) paste as a table already.
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        if (!data || data.types.includes('text/html')) return false;
        const { $from } = view.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === 'table') return false;
        }
        const table = tableFromTabbedText(data.getData('text/plain'));
        if (!table) return false;
        const node = view.state.schema.nodeFromJSON(table);
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      try {
        const content = fromEditorJson(current.getJSON());
        // A table (or another Design block) arrived in Write mode, e.g. pasted
        // from Excel: switch to Design, where its tools are.
        if (modeRef.current === 'write' && usesDesignBlocks(content)) {
          modeRef.current = 'design';
          setMode('design');
          save.mutate({ id: template.id, editorMode: 'design' });
          notifications.show({ message: t('editor.switchedToDesign') });
        }
        // The editor only knows the words; the template's look lives alongside.
        setDocument((previous) =>
          previous.attrs ? { ...content, attrs: previous.attrs } : content,
        );
        setInvalid(false);
        setRevision((value) => value + 1);
      } catch {
        setInvalid(true);
      }
    },
    onFocus: () => {
      bodyTouched.current = true;
    },
  });

  const changed = () => {
    setRevision((value) => value + 1);
  };

  /** How a detail's dates or amounts are shown, everywhere it appears in this template. */
  const setDetailFormat = (name: string, format: DetailFormat | undefined) => {
    if (document.attrs?.detailFormats?.[name] === format) return;
    const detailFormats = Object.fromEntries(
      Object.entries({ ...document.attrs?.detailFormats, [name]: format }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Record<string, DetailFormat>;
    const look: TemplateLook = { ...document.attrs };
    delete look.detailFormats;
    changeLook(Object.keys(detailFormats).length > 0 ? { ...look, detailFormats } : look);
  };

  /** The inbox preview line lives with the template's look, in the document. */
  const setPreviewText = (value: string) => {
    setDocument((previous) => {
      const attrs: TemplateLook = { ...previous.attrs };
      delete attrs.previewText;
      if (value.trim()) attrs.previewText = value;
      const content: WriteDocument = { type: previous.type, content: previous.content };
      return Object.keys(attrs).length > 0 ? { ...content, attrs } : content;
    });
    changed();
  };

  const changeLook = (attrs: TemplateLook) => {
    setDocument((previous) => {
      const content: WriteDocument = { type: previous.type, content: previous.content };
      return Object.keys(attrs).length > 0 ? { ...content, attrs } : content;
    });
    changed();
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

  // The chosen sender's brand look shapes the preview and the letter.
  const sender = senders.data?.find((candidate) => candidate.id === senderId);
  const look = useMemo(
    () => lookFromBrand(sender?.brand, sender?.fromName ?? '', sender?.signature),
    [sender?.brand, sender?.fromName, sender?.signature],
  );
  // What the letter looks like: the sender's look with the template's choices on top.
  const letterLook = useMemo(() => withTemplateLook(look, document.attrs), [look, document.attrs]);
  const [previewDocument] = useDebouncedValue(document, 400);
  const [exampleValues, setExampleValues] = useState<Record<string, string>>({});
  const [debouncedExamples] = useDebouncedValue(exampleValues, 300);
  const usingExamples = Object.values(exampleValues).some((value) => value.trim() !== '');
  const previewResult = useEmailPreview(previewDocument, look);
  const htmlBytes = previewResult.data
    ? new TextEncoder().encode(previewResult.data.html).length
    : undefined;
  const modalPreview = useEmailPreview(
    previewOpen ? previewDocument : undefined,
    look,
    Object.values(debouncedExamples).some((value) => value.trim() !== '')
      ? debouncedExamples
      : null,
  );
  const pictureIds = useMemo(() => emailAssetIds(document, look), [look, document]);
  const picturesSize = useImagesSize(pictureIds);
  const imageBytes = pictureIds.length === 0 ? 0 : picturesSize.data?.bytes;
  const problems = useMemo(
    () => checkTemplate({ subject, document, htmlBytes, imageBytes }),
    [subject, document, htmlBytes, imageBytes],
  );
  const fields = useMemo(
    () => [...new Set([...collectFields(document), ...subjectFields(subject), ...extraFields])],
    [document, subject, extraFields],
  );
  const pickImage = usePickImage();
  const [newPicture, setNewPicture] = useState<{ assetId: string; width: number } | null>(null);
  const [detailTarget, setDetailTarget] = useState<'body' | 'subject' | 'preview'>('body');
  const subjectInsert = useRef<((name: string) => void) | null>(null);
  const previewInsert = useRef<((name: string) => void) | null>(null);
  const [subjectKey, setSubjectKey] = useState(0);

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
      .focus(bodyTouched.current ? null : 'end')
      .insertContent({ type: 'field', attrs: { name: fieldName, fallback } })
      .run();
  };

  const selectedAttrs = (type: 'button' | 'field' | 'image' | 'conditional') =>
    editor.isActive(type) ? (editor.getAttributes(type) as Record<string, unknown>) : undefined;
  const selectedButton = selectedAttrs('button');
  const selectedField = selectedAttrs('field');
  const selectedPicture = selectedAttrs('image');
  const selectedRule = selectedAttrs('conditional');

  const changeMode = (next: 'write' | 'design') => {
    if (next === 'write' && usesDesignBlocks(latest.current.document)) {
      setWriteBlocked(true);
      return;
    }
    setWriteBlocked(false);
    setMode(next);
    save.mutate({ id: template.id, editorMode: next });
  };
  const text = (value: unknown) => (typeof value === 'string' ? value : '');

  const choosePicture = () => {
    pickImage.mutate(undefined, {
      onSuccess: (asset) => {
        if (!asset) return;
        setNewPicture({ assetId: asset.id, width: Math.min(asset.width ?? 300, MAX_IMAGE_WIDTH) });
        setDialog('picture');
      },
    });
  };

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
          <SegmentedControl
            aria-label={t('editor.modeLabel')}
            value={mode}
            onChange={(value) => {
              changeMode(value);
            }}
            data={[
              { value: 'write', label: t('editor.modeWrite') },
              { value: 'design', label: t('editor.modeDesign') },
            ]}
          />
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
      {writeBlocked && (
        <Alert
          color="yellow"
          icon={<IconAlertTriangle />}
          role="status"
          withCloseButton
          onClose={() => {
            setWriteBlocked(false);
          }}
        >
          {t('editor.writeBlocked')}
        </Alert>
      )}
      {sendTest.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(sendTest.error))}
        </Alert>
      )}

      <div className={classes.layout}>
        <Stack gap="md" className={classes.writing}>
          <SubjectInput
            key={subjectKey}
            value={subject}
            onChange={(value) => {
              setSubject(value);
              changed();
            }}
            fields={fields}
            onNewDetail={() => {
              setDetailTarget('subject');
              setDialog('detail');
            }}
            insertRef={subjectInsert}
          />
          <SubjectInput
            key={`preview-${String(subjectKey)}`}
            label={t('editor.previewTextLabel')}
            hint={t('editor.previewTextHint')}
            hintId="preview-text-hint"
            insertLabel={t('editor.previewTextInsertDetail')}
            value={document.attrs?.previewText ?? ''}
            onChange={setPreviewText}
            fields={fields}
            onNewDetail={() => {
              setDetailTarget('preview');
              setDialog('detail');
            }}
            insertRef={previewInsert}
          />
          {pickImage.error && (
            <Alert color="red" icon={<IconAlertTriangle />} role="alert">
              {t(errorKey(pickImage.error))}
            </Alert>
          )}
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
            onPicture={choosePicture}
            onSignature={() => {
              insertBlock(editor, { type: 'signature' }, !bodyTouched.current);
            }}
            onEditPicture={() => {
              setDialog('editPicture');
            }}
            insertDetail={
              <InsertDetailMenu
                fields={fields}
                onInsert={(fieldName) => {
                  insertField(fieldName);
                }}
                onNew={() => {
                  setDetailTarget('body');
                  setDialog('detail');
                }}
              />
            }
          />
          {mode === 'design' && (
            <DesignTools
              editor={editor}
              onAddRule={() => {
                setDialog('rule');
              }}
              onEditRule={() => {
                setDialog('editRule');
              }}
            />
          )}
          {/* Not a themed Paper: the letter always looks like the (light) email. */}
          <div
            className={classes.paper}
            style={
              {
                '--pl-letter-accent': letterLook.primaryColor,
                '--pl-letter-font': letterLook.fontFamily,
                '--pl-letter-size': `${String(TEXT_SIZES[document.attrs?.textSize ?? 'normal'])}px`,
              } as CSSProperties
            }
          >
            {letterLook.logo && (
              <img
                className={classes.logo}
                src={`${APP_ASSET_URL_PREFIX}${letterLook.logo.assetId}`}
                alt={letterLook.logo.alt}
                width={Math.min(letterLook.logo.width, MAX_LOGO_WIDTH)}
              />
            )}
            <SignatureContext.Provider
              value={{ signature: letterLook.signature, hasSender: Boolean(sender) }}
            >
              <EditorContent editor={editor} />
            </SignatureContext.Provider>
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
          <TemplateLookPanel value={document.attrs} senderLook={look} onChange={changeLook} />
          <Paper p="md" radius="lg" bg="var(--pl-accent-soft)" component="section">
            <Text fw={700} size="sm">
              {mode === 'design' ? t('editor.designHelpTitle') : t('editor.designTitle')}
            </Text>
            <Text size="sm" mt={4}>
              {mode === 'design' ? t('editor.designHelpBody') : t('editor.designBody')}
            </Text>
            {mode === 'write' && (
              <Button
                mt="sm"
                size="xs"
                variant="light"
                onClick={() => {
                  changeMode('design');
                }}
              >
                {t('editor.designSwitch')}
              </Button>
            )}
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
                label: text(selectedButton['label']),
                href: text(selectedButton['href']),
              } satisfies ButtonValue)
            : undefined
        }
        onSave={(value) => {
          if (dialog === 'editButton') {
            editor.chain().focus().updateAttributes('button', value).run();
          } else {
            insertBlock(editor, { type: 'button', attrs: value }, !bodyTouched.current);
          }
          closeDialog();
        }}
      />
      <DetailDialog
        opened={dialog === 'detail' || dialog === 'editDetail'}
        onClose={closeDialog}
        initial={
          dialog === 'editDetail' && selectedField
            ? {
                name: text(selectedField['name']),
                fallback: text(selectedField['fallback']),
                format: document.attrs?.detailFormats?.[text(selectedField['name'])],
              }
            : undefined
        }
        onSave={(value) => {
          setDetailFormat(value.name, value.format);
          if (dialog === 'editDetail') {
            editor.chain().focus().updateAttributes('field', { fallback: value.fallback }).run();
          } else {
            setExtraFields((current) => [...current, value.name]);
            if (detailTarget === 'subject') subjectInsert.current?.(value.name);
            else if (detailTarget === 'preview') previewInsert.current?.(value.name);
            else insertField(value.name, value.fallback);
          }
          closeDialog();
        }}
      />
      <RuleDialog
        opened={dialog === 'rule' || dialog === 'editRule'}
        onClose={closeDialog}
        fields={fields}
        initial={
          dialog === 'editRule' && selectedRule
            ? ({
                field: text(selectedRule['field']),
                op: (text(selectedRule['op']) || 'notEmpty') as RuleValue['op'],
                value: text(selectedRule['value']),
              } satisfies RuleValue)
            : undefined
        }
        onSave={(rule) => {
          if (dialog === 'editRule') {
            editor.chain().focus().updateAttributes('conditional', rule).run();
          } else {
            setExtraFields((current) => [...current, rule.field]);
            insertBlock(
              editor,
              { type: 'conditional', attrs: rule, content: [{ type: 'paragraph' }] },
              !bodyTouched.current,
            );
          }
          closeDialog();
        }}
      />
      <PictureDialog
        opened={dialog === 'picture' || dialog === 'editPicture'}
        onClose={closeDialog}
        isEdit={dialog === 'editPicture'}
        maxWidth={MAX_IMAGE_WIDTH}
        initial={
          dialog === 'editPicture' && selectedPicture
            ? {
                alt: text(selectedPicture['alt']),
                width: Number(selectedPicture['width']) || 300,
                align: (text(selectedPicture['align']) || 'center') as PictureValue['align'],
                href: text(selectedPicture['href']),
              }
            : newPicture
              ? { alt: '', width: newPicture.width, align: 'center', href: '' }
              : undefined
        }
        onSave={(value) => {
          const attrs = { ...value, href: value.href || null };
          if (dialog === 'editPicture') {
            editor.chain().focus().updateAttributes('image', attrs).run();
          } else if (newPicture) {
            insertBlock(
              editor,
              { type: 'image', attrs: { assetId: newPicture.assetId, ...attrs } },
              !bodyTouched.current,
            );
            setNewPicture(null);
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
        <div className={classes.previewLayout}>
          <Stack gap="sm" className={classes.exampleValues}>
            <Text fw={700} size="sm">
              {t('editor.examples.title')}
            </Text>
            <Text size="xs" c="var(--pl-muted)">
              {t('editor.examples.hint')}
            </Text>
            {fields.length === 0 && (
              <Text size="sm" c="var(--pl-muted)">
                {t('editor.examples.none')}
              </Text>
            )}
            {fields.map((field) => (
              <TextInput
                key={field}
                size="sm"
                label={field}
                value={exampleValues[field] ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setExampleValues((current) => ({ ...current, [field]: value }));
                }}
              />
            ))}
            {usingExamples && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  setExampleValues({});
                }}
              >
                {t('editor.examples.clear')}
              </Button>
            )}
          </Stack>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" c="var(--pl-muted)">
                {usingExamples ? t('editor.examples.showing') : t('editor.previewHint')}
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
            {modalPreview.data && (
              <>
                <Text size="sm" fw={600} data-testid="preview-subject">
                  {t('editor.examples.subject', {
                    subject: renderSubject(
                      subject,
                      usingExamples ? exampleValues : undefined,
                      document.attrs?.detailFormats,
                    ),
                  })}
                </Text>
                <EmailPreview
                  html={modalPreview.data.html}
                  device={device}
                  title={t('templates.previewFrameTitle')}
                />
              </>
            )}
          </Stack>
        </div>
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
          setSubjectKey((key) => key + 1);
          setName(restored.name);
          setSavedRevision(revision);
        }}
      />
    </Stack>
  );
}
