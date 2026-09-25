import { NumberInput, Stack, Switch, Text, Title } from '@mantine/core';
import type { Preferences } from '@postloom/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type SendingPreferences = Pick<Preferences, 'confirmBeforeSend' | 'delayMs' | 'dailyLimit'>;

/** Settings → Sending: the pace and daily limit for everyone, and the last-chance wait. */
export function SendingDefaults({
  preferences,
  onChange,
}: {
  preferences: SendingPreferences;
  onChange: (changes: Partial<SendingPreferences>) => void;
}) {
  const { t } = useTranslation();
  // Typed values are kept here and saved when the box is left, not on every key.
  const [delay, setDelay] = useState<number | string>(preferences.delayMs / 1000);
  const [limit, setLimit] = useState<number | string>(preferences.dailyLimit);

  const saveDelay = () => {
    const seconds = typeof delay === 'number' ? delay : Number.parseFloat(delay);
    if (!Number.isFinite(seconds)) {
      setDelay(preferences.delayMs / 1000);
      return;
    }
    const delayMs = Math.round(Math.min(600, Math.max(0, seconds)) * 1000);
    setDelay(delayMs / 1000);
    if (delayMs !== preferences.delayMs) onChange({ delayMs });
  };
  const saveLimit = () => {
    const value = typeof limit === 'number' ? limit : Number.parseInt(limit, 10);
    if (!Number.isFinite(value)) {
      setLimit(preferences.dailyLimit);
      return;
    }
    const dailyLimit = Math.round(Math.min(100_000, Math.max(1, value)));
    setLimit(dailyLimit);
    if (dailyLimit !== preferences.dailyLimit) onChange({ dailyLimit });
  };

  return (
    <Stack gap="md">
      <Title order={2} size="h3">
        {t('settings.sending')}
      </Title>
      <NumberInput
        maw={320}
        label={t('settings.delay')}
        description={t('settings.delayHint')}
        rightSection={
          <Text size="sm" c="var(--pl-muted)" pr="xs">
            {t('settings.seconds')}
          </Text>
        }
        rightSectionWidth={80}
        min={0}
        max={600}
        step={1}
        decimalScale={1}
        value={delay}
        onChange={setDelay}
        onBlur={saveDelay}
      />
      <NumberInput
        maw={320}
        label={t('settings.dailyLimit')}
        description={t('settings.dailyLimitHint')}
        min={1}
        max={100_000}
        step={10}
        allowDecimal={false}
        thousandSeparator=","
        value={limit}
        onChange={setLimit}
        onBlur={saveLimit}
      />
      <Switch
        size="md"
        checked={preferences.confirmBeforeSend}
        onChange={(event) => {
          onChange({ confirmBeforeSend: event.currentTarget.checked });
        }}
        label={t('settings.confirmBeforeSend')}
        description={t('settings.confirmBeforeSendHint')}
      />
    </Stack>
  );
}
