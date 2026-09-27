import { Paper, SegmentedControl, Select, Stack, Switch, Text, Title } from '@mantine/core';
import {
  EMAIL_FONTS,
  type BrandLook,
  type DocumentLayout,
  type TemplateLook,
} from '@postloom/editor';
import { useTranslation } from 'react-i18next';
import { ColourField } from '../components/ColourField';

const SWATCHES = ['#0E6B66', '#2F5D8C', '#7A3E9D', '#B42318', '#B54708', '#1F6B45', '#222222'];
const BACKGROUND_SWATCHES = ['#F4F5F7', '#FFFFFF', '#EEF3F8', '#F3EFE7', '#EAF4F0', '#222222'];
/** Select value for "use the sender's font". */
const SENDER_FONT = 'sender';

/**
 * The template's own look: layout, font, text size and colours. Anything
 * left on "Same as sender" follows the sender's brand look.
 */
export function TemplateLookPanel({
  value,
  senderLook,
  onChange,
}: {
  value: TemplateLook | undefined;
  /** The sender's brand look (or Postloom's default), shown as what "same as sender" means. */
  senderLook: BrandLook;
  onChange: (next: TemplateLook) => void;
}) {
  const { t } = useTranslation();
  const look = value ?? {};
  const layout: DocumentLayout = look.layout ?? 'letter';
  const senderFont =
    EMAIL_FONTS.find((font) => font.stack === senderLook.fontFamily)?.label ??
    senderLook.fontFamily;

  const update = (changes: Partial<TemplateLook>) => {
    // Leave out what follows the sender, so the saved template stays small.
    const next = Object.fromEntries(
      Object.entries({ ...look, ...changes }).filter(([, setting]) => setting !== undefined),
    ) as TemplateLook;
    onChange(next);
  };

  return (
    <Paper withBorder p="md" radius="lg" component="section" aria-label={t('look.title')}>
      <Title order={2} size="h5" mb={4}>
        {t('look.title')}
      </Title>
      <Text size="xs" c="var(--pl-muted)" mb="sm">
        {t('look.hint')}
      </Text>
      <Stack gap="sm">
        <div>
          <Text size="sm" fw={600} id="look-layout" mb={4}>
            {t('look.layout')}
          </Text>
          <SegmentedControl
            fullWidth
            size="xs"
            aria-labelledby="look-layout"
            value={layout}
            data={[
              { value: 'letter', label: t('look.layoutLetter') },
              { value: 'card', label: t('look.layoutCard') },
            ]}
            onChange={(next) => {
              update({ layout: next });
            }}
          />
          <Text size="xs" c="var(--pl-muted)" mt={4}>
            {layout === 'letter' ? t('look.layoutLetterHint') : t('look.layoutCardHint')}
          </Text>
        </div>

        <Select
          size="xs"
          label={t('look.font')}
          data={[
            { value: SENDER_FONT, label: t('look.sameAsSender', { value: senderFont }) },
            ...EMAIL_FONTS.map((font) => ({ value: font.stack, label: font.label })),
          ]}
          value={look.fontFamily ?? SENDER_FONT}
          allowDeselect={false}
          onChange={(next) => {
            update({ fontFamily: !next || next === SENDER_FONT ? undefined : next });
          }}
        />

        <div>
          <Text size="sm" fw={600} id="look-size" mb={4}>
            {t('look.textSize')}
          </Text>
          <SegmentedControl
            fullWidth
            size="xs"
            aria-labelledby="look-size"
            value={look.textSize ?? 'normal'}
            data={[
              { value: 'small', label: t('look.sizeSmall') },
              { value: 'normal', label: t('look.sizeNormal') },
              { value: 'large', label: t('look.sizeLarge') },
            ]}
            onChange={(next) => {
              update({ textSize: next === 'normal' ? undefined : next });
            }}
          />
        </div>

        <ColourField
          label={t('look.buttonColour')}
          value={look.primaryColor}
          placeholder={t('look.sameAsSender', { value: senderLook.primaryColor })}
          resetLabel={t('look.useSender')}
          swatches={SWATCHES}
          onChange={(primaryColor) => {
            update({ primaryColor });
          }}
        />

        {layout === 'card' && (
          <ColourField
            label={t('look.background')}
            value={look.backgroundColor}
            placeholder={t('look.sameAsSender', { value: senderLook.backgroundColor })}
            resetLabel={t('look.useSender')}
            swatches={BACKGROUND_SWATCHES}
            onChange={(backgroundColor) => {
              update({ backgroundColor });
            }}
          />
        )}

        {senderLook.logo && (
          <Switch
            size="sm"
            label={t('look.showLogo')}
            checked={look.showLogo !== false}
            onChange={(event) => {
              update({ showLogo: event.currentTarget.checked ? undefined : false });
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}
