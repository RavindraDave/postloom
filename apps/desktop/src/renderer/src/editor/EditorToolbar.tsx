import { ActionIcon, Button, Divider, Group, NativeSelect, Tooltip } from '@mantine/core';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconSeparatorHorizontal,
  IconSquareRoundedPlus,
  IconUnderline,
} from '@tabler/icons-react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './TemplateEditor.module.css';

interface EditorToolbarProps {
  editor: Editor;
  onLink: () => void;
  onButton: () => void;
  onEditButton: () => void;
  onEditDetail: () => void;
  onPicture: () => void;
  onEditPicture: () => void;
  insertDetail: ReactNode;
}

type Style = 'paragraph' | 'h1' | 'h2' | 'h3';

export function EditorToolbar({
  editor,
  onLink,
  onButton,
  onEditButton,
  onEditDetail,
  onPicture,
  onEditPicture,
  insertDetail,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      style: current.isActive('heading', { level: 1 })
        ? 'h1'
        : current.isActive('heading', { level: 2 })
          ? 'h2'
          : current.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph',
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      link: current.isActive('link'),
      hasSelection: !current.state.selection.empty,
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      alignCenter: current.isActive({ textAlign: 'center' }),
      alignRight: current.isActive({ textAlign: 'right' }),
      buttonSelected: current.isActive('button'),
      fieldSelected: current.isActive('field'),
      pictureSelected: current.isActive('image'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const setStyle = (style: Style) => {
    if (style === 'paragraph') chain().setParagraph().run();
    else
      chain()
        .setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 })
        .run();
  };

  return (
    <div role="toolbar" aria-label={t('editor.toolbarLabel')} className={classes.toolbar}>
      <NativeSelect
        aria-label={t('editor.styles.label')}
        size="sm"
        w={150}
        value={state.style}
        onChange={(event) => {
          setStyle(event.currentTarget.value as Style);
        }}
        data={(['paragraph', 'h1', 'h2', 'h3'] as const).map((style) => ({
          value: style,
          label: t(`editor.styles.${style}`),
        }))}
      />
      <Divider orientation="vertical" />
      <Group gap={2} wrap="nowrap">
        <Tool
          label={t('editor.bold')}
          icon={IconBold}
          active={state.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <Tool
          label={t('editor.italic')}
          icon={IconItalic}
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <Tool
          label={t('editor.underline')}
          icon={IconUnderline}
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
        {state.link ? (
          <Tool
            label={t('editor.removeLink')}
            icon={IconLinkOff}
            active
            onClick={() => chain().extendMarkRange('link').unsetLink().run()}
          />
        ) : (
          <Tool
            label={state.hasSelection ? t('editor.link') : t('editor.linkNeedsText')}
            icon={IconLink}
            disabled={!state.hasSelection}
            onClick={onLink}
          />
        )}
      </Group>
      <Divider orientation="vertical" />
      <Group gap={2} wrap="nowrap">
        <Tool
          label={t('editor.bulletList')}
          icon={IconList}
          active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <Tool
          label={t('editor.orderedList')}
          icon={IconListNumbers}
          active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <Tool
          label={t('editor.alignLeft')}
          icon={IconAlignLeft}
          active={!state.alignCenter && !state.alignRight}
          onClick={() => chain().setTextAlign('left').run()}
        />
        <Tool
          label={t('editor.alignCenter')}
          icon={IconAlignCenter}
          active={state.alignCenter}
          onClick={() => chain().setTextAlign('center').run()}
        />
        <Tool
          label={t('editor.alignRight')}
          icon={IconAlignRight}
          active={state.alignRight}
          onClick={() => chain().setTextAlign('right').run()}
        />
        <Tool
          label={t('editor.divider')}
          icon={IconSeparatorHorizontal}
          onClick={() => chain().setHorizontalRule().run()}
        />
      </Group>
      <Divider orientation="vertical" />
      <Button variant="default" size="sm" leftSection={<IconPhoto size={18} />} onClick={onPicture}>
        {t('editor.picture')}
      </Button>
      <Button
        variant="default"
        size="sm"
        leftSection={<IconSquareRoundedPlus size={18} />}
        onClick={onButton}
      >
        {t('editor.button')}
      </Button>
      {insertDetail}
      {state.buttonSelected && (
        <Button variant="subtle" size="sm" onClick={onEditButton}>
          {t('editor.editButton')}
        </Button>
      )}
      {state.pictureSelected && (
        <Button variant="subtle" size="sm" onClick={onEditPicture}>
          {t('editor.editPicture')}
        </Button>
      )}
      {state.fieldSelected && (
        <Button variant="subtle" size="sm" onClick={onEditDetail}>
          {t('editor.editDetail')}
        </Button>
      )}
      <Group gap={2} wrap="nowrap" ml="auto">
        <Tool
          label={t('editor.undo')}
          icon={IconArrowBackUp}
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        />
        <Tool
          label={t('editor.redo')}
          icon={IconArrowForwardUp}
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        />
      </Group>
    </div>
  );
}

function Tool({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} openDelay={400}>
      <ActionIcon
        variant={active ? 'light' : 'subtle'}
        color={active ? 'loom' : 'gray'}
        size="lg"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon size={18} stroke={1.8} />
      </ActionIcon>
    </Tooltip>
  );
}
