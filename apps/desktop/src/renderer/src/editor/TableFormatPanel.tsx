import { Button, Divider, Popover, SegmentedControl, Stack, Text } from '@mantine/core';
import type { TableBorders, TableSpacing } from '@postloom/editor';
import { IconChevronDown, IconTableOptions } from '@tabler/icons-react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { ColourField } from '../components/ColourField';

const LINE_SWATCHES = ['#DDDDDD', '#999999', '#222222', '#2F5D8C', '#0E6B66', '#B42318'];
const FILL_SWATCHES = ['#F6F7F9', '#EEF3F8', '#EAF4F0', '#FFF4CC', '#FDECEA', '#2F5D8C', '#0E6B66'];

type VerticalAlign = 'top' | 'middle' | 'bottom';

/** "Format table ▾": lines, colours, spacing and widths of the table you're in. */
export function TableFormatPanel({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const table = current.getAttributes('table');
      const cell = current.isActive('tableHeader')
        ? current.getAttributes('tableHeader')
        : current.getAttributes('tableCell');
      return {
        borders: (table['borders'] as TableBorders | null) ?? 'rows',
        borderColor: (table['borderColor'] as string | null) ?? undefined,
        headerColor: (table['headerColor'] as string | null) ?? undefined,
        spacing: (table['spacing'] as TableSpacing | null) ?? 'normal',
        fit: Boolean(table['fit']),
        hasHeader: current.isActive('tableHeader') || tableHasHeader(current),
        cellColor: (cell['background'] as string | null) ?? undefined,
        valign: (cell['valign'] as VerticalAlign | null) ?? 'top',
      };
    },
  });
  // Defaults are stored as "not set", so templates stay small and old ones look the same.
  // No .focus(): the panel's own fields keep focus while you type or pick.
  const setTable = (attrs: Record<string, unknown>) =>
    editor.chain().updateAttributes('table', attrs).run();
  const setCells = (name: string, value: unknown) =>
    editor.chain().setCellAttribute(name, value).run();

  return (
    <Popover position="bottom-start" shadow="md" width={300} trapFocus>
      <Popover.Target>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconTableOptions size={16} />}
          rightSection={<IconChevronDown size={14} />}
        >
          {t('editor.table.format')}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={600} id="table-lines" mb={4}>
              {t('editor.table.lines')}
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              aria-labelledby="table-lines"
              value={state.borders}
              data={[
                { value: 'none', label: t('editor.table.linesNone') },
                { value: 'rows', label: t('editor.table.linesRows') },
                { value: 'grid', label: t('editor.table.linesGrid') },
              ]}
              onChange={(value) => setTable({ borders: value === 'rows' ? null : value })}
            />
          </div>
          {state.borders !== 'none' && (
            <ColourField
              label={t('editor.table.lineColour')}
              value={state.borderColor}
              placeholder={t('editor.table.defaultColour')}
              resetLabel={t('editor.table.useDefault')}
              swatches={LINE_SWATCHES}
              onChange={(value) => setTable({ borderColor: value ?? null })}
            />
          )}
          {state.hasHeader && (
            <ColourField
              label={t('editor.table.headerColour')}
              value={state.headerColor}
              placeholder={t('editor.table.noColour')}
              resetLabel={t('editor.table.useDefault')}
              swatches={FILL_SWATCHES}
              onChange={(value) => setTable({ headerColor: value ?? null })}
            />
          )}
          <div>
            <Text size="sm" fw={600} id="table-spacing" mb={4}>
              {t('editor.table.spacing')}
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              aria-labelledby="table-spacing"
              value={state.spacing}
              data={[
                { value: 'compact', label: t('editor.table.compact') },
                { value: 'normal', label: t('editor.table.normal') },
                { value: 'roomy', label: t('editor.table.roomy') },
              ]}
              onChange={(value) => setTable({ spacing: value === 'normal' ? null : value })}
            />
          </div>
          <div>
            <Text size="sm" fw={600} id="table-width" mb={4}>
              {t('editor.table.width')}
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              aria-labelledby="table-width"
              value={state.fit ? 'fit' : 'full'}
              data={[
                { value: 'full', label: t('editor.table.widthFull') },
                { value: 'fit', label: t('editor.table.widthFit') },
              ]}
              onChange={(value) => setTable({ fit: value === 'fit' ? true : null })}
            />
            <Text size="xs" c="var(--pl-muted)" mt={4}>
              {t('editor.table.widthsHint')}
            </Text>
            <Button
              mt={4}
              variant="subtle"
              size="compact-xs"
              onClick={() => {
                equalColumnWidths(editor);
              }}
            >
              {t('editor.table.equalWidths')}
            </Button>
          </div>

          <Divider label={t('editor.table.selectedCells')} labelPosition="left" />
          <Text size="xs" c="var(--pl-muted)">
            {t('editor.table.alignHint')}
          </Text>
          <ColourField
            label={t('editor.table.cellColour')}
            value={state.cellColor}
            placeholder={t('editor.table.noColour')}
            resetLabel={t('editor.table.useDefault')}
            swatches={FILL_SWATCHES}
            onChange={(value) => setCells('background', value ?? null)}
          />
          <div>
            <Text size="sm" fw={600} id="table-valign" mb={4}>
              {t('editor.table.valign')}
            </Text>
            <SegmentedControl
              fullWidth
              size="xs"
              aria-labelledby="table-valign"
              value={state.valign}
              data={[
                { value: 'top', label: t('editor.table.top') },
                { value: 'middle', label: t('editor.table.middle') },
                { value: 'bottom', label: t('editor.table.bottom') },
              ]}
              onChange={(value) => setCells('valign', value === 'top' ? null : value)}
            />
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Whether the table you're in has a header row. */
function tableHasHeader(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return node.firstChild?.firstChild?.type.name === 'tableHeader';
  }
  return false;
}

/** Forgets the dragged column widths of the table you're in, so the columns share the width. */
export function equalColumnWidths(editor: Editor): void {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const table = $from.node(depth);
        if (table.type.name !== 'table') continue;
        const start = $from.start(depth);
        table.descendants((node, pos) => {
          if (node.attrs['colwidth']) {
            tr.setNodeMarkup(start + pos, undefined, { ...node.attrs, colwidth: null });
          }
          return node.type.name !== 'tableCell' && node.type.name !== 'tableHeader';
        });
        return true;
      }
      return false;
    })
    .run();
}
