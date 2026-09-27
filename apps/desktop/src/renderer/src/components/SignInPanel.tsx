import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import type { EmailAccountInfo, SignInProvider } from '@postloom/contracts';
import { IconAlertTriangle, IconBrandGoogle, IconBrandWindows } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../api/ipc';
import { cancelSignIn, useSignIn } from '../api/queries';

const ICONS = { google: IconBrandGoogle, microsoft: IconBrandWindows } as const;

/**
 * "Sign in with Google/Microsoft": opens the provider's own page in the
 * browser, then saves the account (or signs a saved one in again). Postloom
 * never sees the password.
 */
export function SignInPanel({
  provider,
  accountId,
  onSignedIn,
}: {
  provider: SignInProvider;
  /** Sign this saved account in again. */
  accountId?: string;
  onSignedIn: (account: EmailAccountInfo) => void;
}) {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const Icon = ICONS[provider];
  const failure = signIn.error;

  return (
    <Stack gap="sm">
      <Text size="sm" c="var(--pl-ink-soft)">
        {t(`signIn.${provider}.body`)}
      </Text>
      {signIn.isPending ? (
        <Alert color="loom" variant="light" role="status">
          <Stack gap="xs">
            <Text fw={650}>{t('signIn.waiting')}</Text>
            <Text size="sm">{t('signIn.waitingBody')}</Text>
            <Group>
              <Button variant="default" size="xs" onClick={cancelSignIn}>
                {t('signIn.cancel')}
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : (
        <Group>
          <Button
            size="md"
            leftSection={<Icon size={18} />}
            onClick={() => {
              signIn.mutate(
                { provider, ...(accountId && { accountId }) },
                { onSuccess: onSignedIn },
              );
            }}
          >
            {accountId ? t(`signIn.${provider}.again`) : t(`signIn.${provider}.button`)}
          </Button>
        </Group>
      )}
      {failure && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(failure))}
        </Alert>
      )}
    </Stack>
  );
}
