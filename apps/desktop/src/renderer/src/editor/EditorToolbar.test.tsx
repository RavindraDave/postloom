import { writeModeExtensions } from '@postloom/editor/tiptap';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { EditorToolbar } from './EditorToolbar';

let editor: Editor;

function setUp(text = 'Hello there') {
  editor = new Editor({
    extensions: writeModeExtensions,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
  const handlers = {
    onLink: vi.fn(),
    onButton: vi.fn(),
    onEditButton: vi.fn(),
    onEditDetail: vi.fn(),
    onPicture: vi.fn(),
    onEditPicture: vi.fn(),
  };
  renderWithProviders(<EditorToolbar editor={editor} insertDetail={null} {...handlers} />);
  return handlers;
}

const firstBlock = () => editor.getJSON().content[0];

afterEach(() => {
  editor.destroy();
});

describe('EditorToolbar', () => {
  it('is a labelled toolbar whose buttons say what they do', () => {
    setUp();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
    // Links need words to link.
    expect(screen.getByRole('button', { name: 'Select some words first' })).toBeDisabled();
  });

  it('applies bold, italic and underline to the selected words', async () => {
    setUp();
    editor.commands.selectAll();
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    await userEvent.click(screen.getByRole('button', { name: 'Underline' }));

    expect(firstBlock()?.content?.[0]?.marks).toEqual([
      { type: 'bold' },
      { type: 'italic' },
      { type: 'underline' },
    ]);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns text into headings and lists, and aligns it', async () => {
    setUp();
    editor.commands.setTextSelection(2);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Text style' }), 'h2');
    expect(firstBlock()).toMatchObject({ type: 'heading', attrs: { level: 2 } });

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Text style' }),
      'paragraph',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Centre' }));
    expect(firstBlock()).toMatchObject({ type: 'paragraph', attrs: { textAlign: 'center' } });
    await userEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(firstBlock()?.attrs?.['textAlign']).toBe('right');
    await userEvent.click(screen.getByRole('button', { name: 'Align left' }));
    expect(firstBlock()?.attrs?.['textAlign']).toBe('left');

    await userEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
    expect(firstBlock()?.type).toBe('bulletList');
    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    expect(firstBlock()?.type).toBe('orderedList');
  });

  it('adds a divider, and undoes and redoes it', async () => {
    setUp();
    editor.commands.setTextSelection(3);
    await userEvent.click(screen.getByRole('button', { name: 'Divider line' }));
    const hasDivider = () =>
      editor.getJSON().content.some((block) => block.type === 'horizontalRule');
    expect(hasDivider()).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(hasDivider()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(hasDivider()).toBe(true);
  });

  it('opens the link dialog for selected words, and removes a link', async () => {
    const handlers = setUp();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await userEvent.click(await screen.findByRole('button', { name: 'Link' }));
    expect(handlers.onLink).toHaveBeenCalled();

    editor.chain().setLink({ href: 'https://shop.example.org' }).run();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove link' }));
    expect(firstBlock()?.content?.[0]?.marks).toBeUndefined();
  });

  it('offers to edit a selected button or detail', async () => {
    const handlers = setUp();
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'field', attrs: { name: 'First Name' } }] },
        { type: 'button', attrs: { label: 'Pay now', href: 'https://pay.example.org' } },
      ],
    });
    editor.commands.setNodeSelection(1);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit detail' }));
    expect(handlers.onEditDetail).toHaveBeenCalled();

    editor.commands.setNodeSelection(3);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit button' }));
    expect(handlers.onEditButton).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Button' }));
    expect(handlers.onButton).toHaveBeenCalled();
  });
});
