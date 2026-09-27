import { ActionIcon, Input, Tooltip } from '@mantine/core';
import { senderSignatureSchema, type SenderSignature } from '@postloom/editor';
import { signatureExtensions } from '@postloom/editor/tiptap';
import { IconBold, IconItalic, IconUnderline } from '@tabler/icons-react';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { TextColourMenus } from '../editor/TextColourMenu';
import classes from './SignatureEditor.module.css';

/** The editor's content as a signature; null when it has no words. */
function toSignature(editor: Editor): SenderSignature | null {
  const parsed = senderSignatureSchema.safeParse(editor.getJSON());
  return parsed.success && editor.getText().trim() ? parsed.data : null;
}

/** A sender's signature: a few formatted lines, edited like a tiny letter. */
export function SignatureEditor({
  value,
  onChange,
}: {
  value: SenderSignature | null;
  onChange: (signature: SenderSignature | null) => void;
}) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions: signatureExtensions,
    // A stored signature is valid editor JSON; the types differ only in optional spelling.
    content: (value as JSONContent | null) ?? '',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': t('senders.signatureLabel'),
        'aria-multiline': 'true',
        'aria-describedby': 'signature-hint',
        class: classes.input ?? '',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(toSignature(current));
    },
  });

  return (
    <Input.Wrapper
      label={t('senders.signatureLabel')}
      description={t('senders.signatureHint')}
      descriptionProps={{ id: 'signature-hint' }}
      labelElement="div"
    >
      <div className={classes.box}>
        <SignatureTools editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </Input.Wrapper>
  );
}

function SignatureTools({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label={t('senders.signatureTools')} className={classes.tools}>
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
      <TextColourMenus editor={editor} />
    </div>
  );
}

function Tool({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} openDelay={400}>
      <ActionIcon
        variant={active ? 'light' : 'subtle'}
        color={active ? 'loom' : 'gray'}
        size="md"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
      >
        <Icon size={16} stroke={1.8} />
      </ActionIcon>
    </Tooltip>
  );
}
