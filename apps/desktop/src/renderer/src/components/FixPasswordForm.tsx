import { Alert, Button, Group, PasswordInput, Stack } from '@mantine/core';
import type { EmailAccountInfo } from '@postloom/contracts';
import { PROVIDER_PRESETS } from '@postloom/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import { useTestConnection, useUpdateAccount } from '../api/queries';

interface FixPasswordFormProps {
  account: EmailAccountInfo;
  onFixed: (account: EmailAccountInfo) => void;
}

/** "Paste it here → Check and save": the new password is only stored once it works. */
export function FixPasswordForm({ account, onFixed }: FixPasswordFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const testConnection = useTestConnection();
  const updateAccount = useUpdateAccount();
  const busy = testConnection.isPending || updateAccount.isPending;
  const failure = testConnection.error ?? updateAccount.error;
  const preset = PROVIDER_PRESETS[account.provider];

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!password || busy) return;
    const { host, port, security, username } = account;
    try {
      await testConnection.mutateAsync({ host, port, security, username, password });
      onFixed(await updateAccount.mutateAsync({ id: account.id, password }));
    } catch {
      // Shown below from the mutation state.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="sm">
        <PasswordInput
          label={
            preset.needsAppPassword
              ? t('accounts.newAppPasswordLabel')
              : t('accounts.newPasswordLabel')
          }
          description={
            preset.needsAppPassword
              ? t(`accounts.providers.${account.provider}.appPasswordHelp`)
              : undefined
          }
          autoComplete="off"
          value={password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
          }}
        />
        {failure && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(failure))}
          </Alert>
        )}
        <Group>
          <Button type="submit" loading={busy} disabled={!password}>
            {t('accounts.checkAndSave')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
