import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

/** Containers whose children are whole blocks. */
const CONTAINERS = new Set(['doc', 'column', 'conditional']);

/**
 * Adds a block (picture, button, columns, table…) next to where the person
 * is, without splitting their sentence: after the current paragraph, or in
 * place of an empty one. Until they've clicked into the letter, it goes at
 * the end.
 */
export function insertBlock(editor: Editor, content: JSONContent, atEnd = false): void {
  if (atEnd) {
    editor.chain().focus('end').insertContent(content).run();
    return;
  }
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock || $from.depth === 0) {
    editor.chain().focus().insertContent(content).run();
    return;
  }
  // An empty paragraph is simply replaced.
  if ($from.parent.content.size === 0 && CONTAINERS.has($from.node($from.depth - 1).type.name)) {
    editor.chain().focus().insertContent(content).run();
    return;
  }
  // Climb to the whole block (e.g. the list, not the list item's paragraph).
  let depth = $from.depth;
  while (depth > 1 && !CONTAINERS.has($from.node(depth - 1).type.name)) depth -= 1;
  editor.chain().focus().insertContentAt($from.after(depth), content).run();
}

/** A table with a header row, ready to fill in. */
export function newTable(rows = 3, columns = 3): JSONContent {
  const cell = (type: 'tableHeader' | 'tableCell') => ({
    type,
    content: [{ type: 'paragraph' }],
  });
  return {
    type: 'table',
    content: Array.from({ length: rows }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: columns }, () => cell(row === 0 ? 'tableHeader' : 'tableCell')),
    })),
  };
}
