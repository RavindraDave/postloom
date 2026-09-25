import { Button, Divider, Group, Menu } from '@mantine/core';
import {
  IconChevronDown,
  IconColumns2,
  IconColumns3,
  IconEye,
  IconLayoutBottombar,
  IconSpacingVertical,
  IconSquarePlus,
  IconTable,
} from '@tabler/icons-react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { insertBlock, newTable } from './insertBlock';

interface DesignToolsProps {
  editor: Editor;
  onAddRule: () => void;
  onEditRule: () => void;
}

const emptyColumn = { type: 'column', content: [{ type: 'paragraph' }] };

/** "Add block ▾" plus tools for the table, columns or show-only-if part you're in. */
export function DesignTools({ editor, onAddRule, onEditRule }: DesignToolsProps) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      inTable: current.isActive('table'),
      inColumns: current.isActive('columns'),
      inRule: current.isActive('conditional'),
      headerRow: current.isActive('tableHeader'),
      striped: Boolean(current.getAttributes('table')['striped']),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <Group gap={6} wrap="wrap">
      <Menu position="bottom-start" shadow="md">
        <Menu.Target>
          <Button
            variant="light"
            size="sm"
            leftSection={<IconSquarePlus size={18} />}
            rightSection={<IconChevronDown size={14} />}
          >
            {t('editor.addBlock')}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconColumns2 size={16} />}
            disabled={state.inColumns || state.inRule || state.inTable}
            onClick={() => {
              insertBlock(editor, { type: 'columns', content: [emptyColumn, emptyColumn] });
            }}
          >
            {t('editor.blocks.columns2')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconColumns3 size={16} />}
            disabled={state.inColumns || state.inRule || state.inTable}
            onClick={() => {
              insertBlock(editor, {
                type: 'columns',
                content: [emptyColumn, emptyColumn, emptyColumn],
              });
            }}
          >
            {t('editor.blocks.columns3')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconTable size={16} />}
            disabled={state.inColumns || state.inTable}
            onClick={() => {
              insertBlock(editor, newTable());
            }}
          >
            {t('editor.blocks.table')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconEye size={16} />}
            disabled={state.inColumns || state.inRule || state.inTable}
            onClick={onAddRule}
          >
            {t('editor.blocks.conditional')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconSpacingVertical size={16} />}
            disabled={state.inTable}
            onClick={() =>
              chain()
                .insertContent({ type: 'spacer', attrs: { height: 24 } })
                .run()
            }
          >
            {t('editor.blocks.spacer')}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconLayoutBottombar size={16} />}
            onClick={() =>
              editor.chain().focus('end').insertContent({ type: 'footer', content: [] }).run()
            }
          >
            {t('editor.blocks.footer')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {state.inTable && (
        <>
          <Divider orientation="vertical" />
          <Button variant="subtle" size="xs" onClick={() => chain().addRowAfter().run()}>
            {t('editor.table.addRow')}
          </Button>
          <Button variant="subtle" size="xs" onClick={() => chain().addColumnAfter().run()}>
            {t('editor.table.addColumn')}
          </Button>
          <Button variant="subtle" size="xs" onClick={() => chain().deleteRow().run()}>
            {t('editor.table.deleteRow')}
          </Button>
          <Button variant="subtle" size="xs" onClick={() => chain().deleteColumn().run()}>
            {t('editor.table.deleteColumn')}
          </Button>
          <Button
            variant={state.headerRow ? 'light' : 'subtle'}
            size="xs"
            aria-pressed={state.headerRow}
            onClick={() => chain().toggleHeaderRow().run()}
          >
            {t('editor.table.headerRow')}
          </Button>
          <Button
            variant={state.striped ? 'light' : 'subtle'}
            size="xs"
            aria-pressed={state.striped}
            onClick={() => chain().updateAttributes('table', { striped: !state.striped }).run()}
          >
            {t('editor.table.striped')}
          </Button>
          <Button
            variant="subtle"
            size="xs"
            color="red"
            onClick={() => chain().deleteTable().run()}
          >
            {t('editor.table.delete')}
          </Button>
        </>
      )}
      {state.inColumns && (
        <Button
          variant="subtle"
          size="xs"
          color="red"
          onClick={() => chain().deleteNode('columns').run()}
        >
          {t('editor.removeColumns')}
        </Button>
      )}
      {state.inRule && (
        <>
          <Button variant="subtle" size="xs" onClick={onEditRule}>
            {t('editor.editRule')}
          </Button>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => {
              unwrapConditional(editor);
            }}
          >
            {t('editor.removeRule')}
          </Button>
        </>
      )}
    </Group>
  );
}

/** "Show to everyone": keeps the part's content and removes its rule. */
export function unwrapConditional(editor: Editor): void {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'conditional') continue;
    const from = $from.before(depth);
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.replaceWith(from, from + node.nodeSize, node.content);
        return true;
      })
      .run();
    return;
  }
}
