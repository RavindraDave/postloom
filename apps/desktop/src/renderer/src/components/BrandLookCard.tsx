import { Alert, Button, ColorInput, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { SenderInfo } from '@postloom/contracts';
import { DEFAULT_BRAND, EMAIL_FONTS } from '@postloom/editor';
import { APP_ASSET_URL_PREFIX } from '@postloom/editor/tiptap';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import { usePickImage, useSetBrand } from '../api/queries';

/** A few friendly starting colours; any colour can be typed or picked. */
const SWATCHES = ['#0E6B66', '#2F5D8C', '#7A3E9D', '#B42318', '#B54708', '#1F6B45', '#222222'];

/** Logo, colour and font for a sender's emails (design: Senders, "Brand look"). */
export function BrandLookCard({ sender }: { sender: SenderInfo }) {
  const { t } = useTranslation();
  const setBrand = useSetBrand();
  const pickImage = usePickImage();
  const brand = sender.brand;
  const [editing, setEditing] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(
    brand?.primaryColor ?? DEFAULT_BRAND.primaryColor,
  );
  const [fontFamily, setFontFamily] = useState(brand?.fontFamily ?? DEFAULT_BRAND.fontFamily);
  const [logo, setLogo] = useState(brand?.logo ?? null);
  const validColour = /^#[0-9a-fA-F]{6}$/.test(primaryColor);
  const error = setBrand.error ?? pickImage.error;

  const save = () => {
    setBrand.mutate(
      {
        id: sender.id,
        brand: { primaryColor, fontFamily, logoAssetId: logo?.assetId ?? null },
      },
      {
        onSuccess: () => {
          setEditing(false);
          notifications.show({ message: t('senders.brandSaved'), color: 'green' });
        },
      },
    );
  };

  return (
    <Paper withBorder p="lg" radius="lg" component="section" aria-label={t('senders.brand')}>
      <Group justify="space-between" mb="xs">
        <Title order={3} size="h5">
          {t('senders.brand')}
        </Title>
        {brand && !editing && (
          <Button
            variant="subtle"
            size="xs"
            color="gray"
            loading={setBrand.isPending}
            onClick={() => {
              setBrand.mutate({ id: sender.id, brand: null });
            }}
          >
            {t('senders.brandRemove')}
          </Button>
        )}
      </Group>
      <Text size="sm" c="var(--pl-muted)" mb="md">
        {t('senders.brandHint')}
      </Text>

      {!brand && !editing && (
        <Group justify="space-between">
          <Text size="sm">{t('senders.brandNone')}</Text>
          <Button
            variant="default"
            onClick={() => {
              setEditing(true);
            }}
          >
            {t('senders.brandAdd')}
          </Button>
        </Group>
      )}

      {(brand || editing) && (
        <Stack gap="md">
          <Group gap="md" align="center">
            <div
              style={{
                width: 160,
                height: 64,
                border: '1px dashed var(--pl-control)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FFFFFF',
              }}
            >
              {logo ? (
                <img
                  src={`${APP_ASSET_URL_PREFIX}${logo.assetId}`}
                  alt={t('senders.logo')}
                  style={{ maxWidth: 150, maxHeight: 56 }}
                />
              ) : (
                <Text size="xs" c="dimmed">
                  {t('senders.logoNone')}
                </Text>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              loading={pickImage.isPending}
              onClick={() => {
                pickImage.mutate(undefined, {
                  onSuccess: (asset) => {
                    if (!asset) return;
                    setLogo({
                      assetId: asset.id,
                      width: asset.width ?? 200,
                      height: asset.height ?? 60,
                    });
                    setEditing(true);
                  },
                });
              }}
            >
              {logo ? t('senders.logoChange') : t('senders.logoChoose')}
            </Button>
            {logo && (
              <Button
                variant="subtle"
                size="sm"
                color="gray"
                onClick={() => {
                  setLogo(null);
                  setEditing(true);
                }}
              >
                {t('senders.logoRemove')}
              </Button>
            )}
          </Group>
          <ColorInput
            label={t('senders.colour')}
            value={primaryColor}
            format="hex"
            swatches={SWATCHES}
            eyeDropperButtonProps={{ 'aria-label': t('look.pickFromScreen') }}
            onChange={(value) => {
              setPrimaryColor(value.toUpperCase());
              setEditing(true);
            }}
            error={validColour ? undefined : t('senders.colour')}
          />
          <Select
            label={t('senders.font')}
            description={t('senders.fontHint')}
            data={EMAIL_FONTS.map((font) => ({ value: font.stack, label: font.label }))}
            value={fontFamily}
            allowDeselect={false}
            onChange={(value) => {
              if (value) setFontFamily(value);
              setEditing(true);
            }}
          />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle />} role="alert">
              {t(errorKey(error))}
            </Alert>
          )}
          {editing && (
            <Group justify="flex-end">
              <Button onClick={save} loading={setBrand.isPending} disabled={!validColour}>
                {t('senders.brandSave')}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Paper>
  );
}
