import { Input, Text } from '@mantine/core';
import { renderSubject, SUBJECT_SOFT_LIMIT } from '@postloom/editor';
import {
  subjectExtensions,
  subjectFromEditorJson,
  subjectToEditorContent,
} from '@postloom/editor/tiptap';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { InsertDetailMenu } from './InsertDetailMenu';
import classes from './TemplateEditor.module.css';

/** One line only: Enter does nothing, pasted line breaks become spaces. */
const SingleLine = Extension.create({
  name: 'singleLine',
  addKeyboardShortcuts: () => ({ Enter: () => true, 'Shift-Enter': () => true }),
});

interface SubjectInputProps {
  value: string;
  onChange: (subject: string) => void;
  fields: string[];
  onNewDetail: () => void;
  /** Filled in with a function that inserts a detail here (for "New detail…"). */
  insertRef?: RefObject<((name: string) => void) | null>;
}

/** The subject line, with personal details shown as chips (never as `{{…}}`). */
export function SubjectInput({
  value,
  onChange,
  fields,
  onNewDetail,
  insertRef,
}: SubjectInputProps) {
  const { t } = useTranslation();
  // Until the person has clicked into the subject, add details at the end.
  const touched = useRef(false);
  const editor = useEditor({
    extensions: [...subjectExtensions, SingleLine],
    content: subjectToEditorContent(value),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': t('editor.subjectLabel'),
        'aria-multiline': 'false',
        'aria-describedby': 'subject-hint',
        class: classes.subjectInput ?? '',
      },
      transformPastedText: (text) => text.replace(/[\r\n]+/g, ' '),
    },
    onUpdate: ({ editor: current }) => {
      onChange(subjectFromEditorJson(current.getJSON()));
    },
    onFocus: () => {
      touched.current = true;
    },
  });

  const insert = (name: string) => {
    editor
      .chain()
      .focus(touched.current ? null : 'end')
      .insertContent({ type: 'field', attrs: { name, fallback: '' } })
      .run();
  };
  useEffect(() => {
    if (insertRef) insertRef.current = insert;
  });

  return (
    <Input.Wrapper label={t('editor.subjectLabel')} labelElement="div">
      <Text id="subject-hint" size="xs" c="var(--pl-muted)" mb={6}>
        {t('editor.subjectHint', {
          count: renderSubject(value).length,
          limit: SUBJECT_SOFT_LIMIT,
        })}
      </Text>
      <div className={classes.subjectRow}>
        <div className={classes.subjectBox}>
          <EditorContent editor={editor} />
        </div>
        <InsertDetailMenu
          fields={fields}
          onInsert={insert}
          onNew={onNewDetail}
          label={t('editor.subjectInsertDetail')}
          compact
        />
      </div>
    </Input.Wrapper>
  );
}
