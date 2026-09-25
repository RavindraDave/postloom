import {
  Alert,
  Anchor,
  Button,
  Collapse,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { EmailAccountInfo } from '@postloom/contracts';
import { isPlausibleEmail, PROVIDER_PRESETS, type ProviderId } from '@postloom/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import { useCreateAccount, useSecurity, useTestConnection } from '../api/queries';

interface ConnectAccountFormProps {
  provider: ProviderId;
  onConnected: (account: EmailAccountInfo) => void;
  /** Shown to the left of the main button, e.g. "Back" or "Cancel". */
  secondaryAction?: ReactNode;
}

/**
 * Email address + (app) password, checked with the provider before anything is
 * saved. Server details are pre-filled from the provider and hidden unless
 * the person picked "Something else" or asks to see them.
 */
export function ConnectAccountForm({
  provider,
  onConnected,
  secondaryAction,
}: ConnectAccountFormProps) {
  const { t } = useTranslation();
  const preset = PROVIDER_PRESETS[provider];
  const security = useSecurity();
  const testConnection = useTestConnection();
  const createAccount = useCreateAccount();

  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showServer, setShowServer] = useState(provider === 'other');
  const [host, setHost] = useState(preset.host);
  const [port, setPort] = useState<number>(preset.port);
  const [connectionSecurity, setConnectionSecurity] = useState(preset.security);
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const cantSavePasswords = security.data?.secretProtection === 'unavailable';
  const signInName = username.trim() || address.trim();
  // "My Gmail"; for other providers the address says more than "Something else".
  const defaultName =
    provider === 'other'
      ? address.trim() || t('accounts.defaultNameOther')
      : t('accounts.defaultName', { provider: preset.label });
  const problems = {
    address: isPlausibleEmail(address) ? null : t('accounts.addressInvalid'),
    password: password ? null : t('accounts.passwordMissing'),
    host: host.trim() ? null : t('accounts.hostMissing'),
  };
  const valid = !problems.address && !problems.password && !problems.host;
  const busy = testConnection.isPending || createAccount.isPending;
  const failure = testConnection.error ?? createAccount.error;

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || busy || cantSavePasswords) return;
    testConnection.reset();
    createAccount.reset();
    const connection = {
      host: host.trim(),
      port,
      security: connectionSecurity,
      username: signInName,
      password,
    };
    try {
      await testConnection.mutateAsync(connection);
      const account = await createAccount.mutateAsync({
        ...connection,
        provider,
        name: name.trim() || defaultName,
      });
      onConnected(account);
    } catch {
      // Shown below from the mutation state.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('accounts.addressLabel')}
          description={t('accounts.addressHint')}
          type="email"
          autoComplete="email"
          value={address}
          onChange={(event) => {
            setAddress(event.currentTarget.value);
          }}
          error={submitted ? problems.address : undefined}
          required
          data-autofocus
        />
        <PasswordInput
          label={
            preset.needsAppPassword ? t('accounts.appPasswordLabel') : t('accounts.passwordLabel')
          }
          description={
            preset.needsAppPassword
              ? t(`accounts.providers.${provider}.appPasswordHelp`)
              : t('accounts.passwordHint')
          }
          autoComplete="off"
          value={password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
          }}
          error={submitted ? problems.password : undefined}
          required
        />
        <TextInput
          label={t('accounts.nameLabel')}
          description={t('accounts.nameHint')}
          placeholder={defaultName}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />

        {provider !== 'other' && (
          <Anchor
            component="button"
            type="button"
            size="sm"
            ta="left"
            onClick={() => {
              setShowServer((shown) => !shown);
            }}
            aria-expanded={showServer}
          >
            {showServer ? t('accounts.hideServer') : t('accounts.showServer')}
          </Anchor>
        )}
        <Collapse expanded={showServer}>
          <Stack gap="md">
            <TextInput
              label={t('accounts.hostLabel')}
              description={t('accounts.hostHint')}
              value={host}
              onChange={(event) => {
                setHost(event.currentTarget.value);
              }}
              error={submitted ? problems.host : undefined}
            />
            <Group grow align="flex-start">
              <NumberInput
                label={t('accounts.portLabel')}
                min={1}
                max={65535}
                allowDecimal={false}
                value={port}
                onChange={(value) => {
                  if (typeof value === 'number') setPort(value);
                }}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {t('accounts.securityLabel')}
                </Text>
                <SegmentedControl
                  aria-label={t('accounts.securityLabel')}
                  value={connectionSecurity}
                  onChange={(value) => {
                    setConnectionSecurity(value);
                  }}
                  data={[
                    { value: 'starttls', label: 'STARTTLS' },
                    { value: 'tls', label: 'SSL/TLS' },
                  ]}
                />
              </Stack>
            </Group>
            <TextInput
              label={t('accounts.usernameLabel')}
              description={t('accounts.usernameHint')}
              placeholder={address}
              value={username}
              onChange={(event) => {
                setUsername(event.currentTarget.value);
              }}
            />
          </Stack>
        </Collapse>

        {failure && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(failure))}
          </Alert>
        )}

        <Group justify="space-between">
          {secondaryAction ?? <span />}
          <Stack gap={4} align="flex-end">
            <Button type="submit" loading={busy} disabled={cantSavePasswords}>
              {t('accounts.checkAndSave')}
            </Button>
            {busy && (
              <Text size="sm" c="var(--pl-muted)" role="status">
                {t('accounts.checking', { provider: preset.label })}
              </Text>
            )}
          </Stack>
        </Group>
      </Stack>
    </form>
  );
}
