import {
  ActionIcon,
  Button,
  ColorSwatch,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconHighlight, IconTextColor } from '@tabler/icons-react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Colours that read well on white in every inbox, with names for screen readers. */
const TEXT_COLOURS = [
  ['#B42318', 'red'],
  ['#C4320A', 'orange'],
  ['#0E6B66', 'teal'],
  ['#2F5D8C', 'blue'],
  ['#1D6F2F', 'green'],
  ['#6B3FA0', 'purple'],
  ['#666666', 'grey'],
  ['#222222', 'black'],
] as const;

const HIGHLIGHTS = [
  ['#FFF4A3', 'yellow'],
  ['#D8F3DC', 'green'],
  ['#DCEBFA', 'blue'],
  ['#FDE2E1', 'pink'],
  ['#FFE8CC', 'orange'],
  ['#ECE4F7', 'purple'],
  ['#EEEEEE', 'grey'],
] as const;

type Kind = 'text' | 'highlight';

/** "Text colour" and "Highlight" buttons, each with a small palette. */
export function TextColourMenus({ editor }: { editor: Editor }) {
  return (
    <>
      <ColourMenu editor={editor} kind="text" />
      <ColourMenu editor={editor} kind="highlight" />
    </>
  );
}

function ColourMenu({ editor, kind }: { editor: Editor; kind: Kind }) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const mark = kind === 'text' ? 'textColor' : 'highlight';
  const current = useEditorState({
    editor,
    selector: ({ editor: now }) => (now.getAttributes(mark)['color'] as string | null) ?? null,
  });
  const palette = kind === 'text' ? TEXT_COLOURS : HIGHLIGHTS;
  const label = t(kind === 'text' ? 'editor.colour.text' : 'editor.colour.highlight');
  const Icon = kind === 'text' ? IconTextColor : IconHighlight;

  const apply = (color: string | null) => {
    const chain = editor.chain().focus();
    if (kind === 'text') chain.setTextColour(color).run();
    else chain.setHighlightColour(color).run();
    setOpened(false);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom" shadow="md" trapFocus>
      <Popover.Target>
        <Tooltip label={label} openDelay={400}>
          <ActionIcon
            variant={current ? 'light' : 'subtle'}
            color={current ? 'loom' : 'gray'}
            size="lg"
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={opened}
            onClick={() => {
              setOpened((open) => !open);
            }}
          >
            <Icon
              size={18}
              stroke={1.8}
              style={current ? { borderBottom: `3px solid ${current}` } : undefined}
            />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <SimpleGrid cols={4} spacing={6}>
            {palette.map(([color, name]) => {
              const colourName = t(`editor.colour.names.${name}`);
              return (
                <ColorSwatch
                  key={color}
                  component="button"
                  type="button"
                  color={color}
                  size={26}
                  radius="sm"
                  aria-label={colourName}
                  aria-pressed={current === color}
                  title={colourName}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    apply(color);
                  }}
                />
              );
            })}
          </SimpleGrid>
          <Button
            variant="subtle"
            size="compact-xs"
            color="gray"
            onClick={() => {
              apply(null);
            }}
          >
            {t(kind === 'text' ? 'editor.colour.noText' : 'editor.colour.noHighlight')}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
