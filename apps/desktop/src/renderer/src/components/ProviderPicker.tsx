import { Radio, Text } from '@mantine/core';
import { PROVIDER_IDS, PROVIDER_PRESETS, type ProviderId } from '@postloom/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import classes from './ProviderPicker.module.css';

interface ProviderPickerProps {
  value: ProviderId | null;
  onChange: (provider: ProviderId) => void;
}

/** Big, keyboard-friendly provider tiles (a radio group underneath). */
export function ProviderPicker({ value, onChange }: ProviderPickerProps) {
  const { t } = useTranslation();
  return (
    <Radio.Group
      value={value}
      onChange={(next) => {
        onChange(next);
      }}
      label={t('accounts.providerLabel')}
      labelProps={{ className: classes.label }}
    >
      <div className={classes.grid}>
        {PROVIDER_IDS.map((id) => {
          const selected = value === id;
          return (
            <Radio.Card
              key={id}
              value={id}
              className={classes.tile}
              data-selected={selected || undefined}
              radius="lg"
            >
              <span className={classes.badge} data-provider={id} aria-hidden>
                {id === 'other' ? '@' : PROVIDER_PRESETS[id].label.charAt(0)}
              </span>
              <span className={classes.text}>
                <Text fw={650}>{t(`accounts.providers.${id}.label`)}</Text>
                <Text size="sm" c="var(--pl-muted)">
                  {t(`accounts.providers.${id}.hint`)}
                </Text>
              </span>
              {selected && <IconCheck className={classes.check} size={20} aria-hidden />}
            </Radio.Card>
          );
        })}
      </div>
    </Radio.Group>
  );
}
