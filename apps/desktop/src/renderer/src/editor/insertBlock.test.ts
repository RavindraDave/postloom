import { writeModeExtensions } from '@postloom/editor/tiptap';
import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { insertBlock, newTable } from './insertBlock';

let editor: Editor;
afterEach(() => {
  editor.destroy();
});

const text = (value: string) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] });
const spacer = { type: 'spacer', attrs: { height: 24 } };

function setUp(content: object[]) {
  editor = new Editor({ extensions: writeModeExtensions, content: { type: 'doc', content } });
}
const types = () => editor.getJSON().content.map((block) => block.type);

describe('adding a block', () => {
  it('goes after the paragraph instead of splitting its words', () => {
    setUp([text('Hello there friend'), text('Bye')]);
    editor.commands.setTextSelection(7); // inside "Hello there friend"
    insertBlock(editor, spacer);
    expect(types()).toEqual(['paragraph', 'spacer', 'paragraph']);
    expect(editor.getJSON().content[0]).toEqual(text('Hello there friend'));
  });

  it('replaces an empty paragraph', () => {
    setUp([text('Hi'), { type: 'paragraph' }]);
    editor.commands.setTextSelection(5);
    insertBlock(editor, spacer);
    expect(types()).toEqual(['paragraph', 'spacer']);
  });

  it('goes after a whole list, not inside it', () => {
    setUp([
      { type: 'bulletList', content: [{ type: 'listItem', content: [text('One')] }] },
      text('After'),
    ]);
    editor.commands.setTextSelection(4);
    insertBlock(editor, newTable(2, 2));
    expect(types()).toEqual(['bulletList', 'table', 'paragraph']);
  });

  it('goes at the end until the person has clicked into the letter', () => {
    setUp([text('First'), text('Last')]);
    insertBlock(editor, spacer, true);
    expect(types()).toEqual(['paragraph', 'paragraph', 'spacer']);
  });
});
