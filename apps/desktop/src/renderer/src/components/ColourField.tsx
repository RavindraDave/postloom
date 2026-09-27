import { Button, ColorInput, Group } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/**
 * A colour that can be left unset ("follows something else"). Typing goes
 * through a draft, so half-typed colours are never saved; only #RRGGBB is.
 */
export function ColourField({
  label,
  value,
  placeholder,
  resetLabel,
  swatches,
  onChange,
}: {
  label: string;
  value: string | undefined;
  /** What an unset colour means, e.g. "Same as sender (#2F5D8C)". */
  placeholder: string;
  /** The button that clears the colour, e.g. "Use the sender's". */
  resetLabel: string;
  swatches: string[];
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value ?? '');
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // The saved colour changed elsewhere (e.g. reset, or another cell): show it.
    setShown(value);
    setDraft(value ?? '');
  }

  return (
    <div>
      <ColorInput
        size="xs"
        label={label}
        format="hex"
        // Validity is handled here (drafts), so leaving the field never resets it.
        fixOnBlur={false}
        swatches={swatches}
        eyeDropperButtonProps={{ 'aria-label': t('look.pickFromScreen') }}
        placeholder={placeholder}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (HEX_COLOUR.test(next)) onChange(next.toUpperCase());
        }}
        error={draft !== '' && !HEX_COLOUR.test(draft) ? t('look.colourInvalid') : undefined}
      />
      {value && (
        <Group justify="flex-end">
          <Button
            variant="subtle"
            size="compact-xs"
            color="gray"
            onClick={() => {
              setDraft('');
              onChange(undefined);
            }}
          >
            {resetLabel}
          </Button>
        </Group>
      )}
    </div>
  );
}
