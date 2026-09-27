import { Anchor, Stack, Text } from '@mantine/core';
import type { EmailAccountInfo, SignInProvider } from '@postloom/contracts';
import type { ProviderId } from '@postloom/core';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSignInProviders } from '../api/queries';
import { ConnectAccountForm } from './ConnectAccountForm';
import { SignInPanel } from './SignInPanel';

/** The providers whose own sign-in Postloom offers. */
const SIGN_IN: Partial<Record<ProviderId, SignInProvider>> = {
  gmail: 'google',
  outlook: 'microsoft',
};

/** The sign-in a provider offers in this build, if any. */
export function useSignInFor(provider: ProviderId): SignInProvider | null {
  const providers = useSignInProviders();
  const signIn = SIGN_IN[provider];
  return signIn && providers.data?.includes(signIn) ? signIn : null;
}

/**
 * Connecting an email account. Gmail and Outlook sign in with Google or
 * Microsoft, with a password as the fallback (Gmail app passwords, and work
 * accounts whose IT still allows passwords). Everything else uses a password.
 */
export function ConnectAccount({
  provider,
  onConnected,
  secondaryAction,
}: {
  provider: ProviderId;
  onConnected: (account: EmailAccountInfo) => void;
  secondaryAction?: ReactNode;
}) {
  const { t } = useTranslation();
  const signIn = useSignInFor(provider);
  const [usePassword, setUsePassword] = useState(false);

  if (signIn && !usePassword) {
    return (
      <Stack gap="md">
        <SignInPanel provider={signIn} onSignedIn={onConnected} />
        <Text size="sm" c="var(--pl-muted)">
          {t(`signIn.${signIn}.passwordInstead`)}{' '}
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() => {
              setUsePassword(true);
            }}
          >
            {t(`signIn.${signIn}.usePassword`)}
          </Anchor>
        </Text>
        {secondaryAction}
      </Stack>
    );
  }
  return (
    <Stack gap="md">
      {signIn && (
        <Anchor
          component="button"
          type="button"
          size="sm"
          ta="left"
          onClick={() => {
            setUsePassword(false);
          }}
        >
          {t(`signIn.${signIn}.useSignIn`)}
        </Anchor>
      )}
      <ConnectAccountForm
        provider={provider}
        onConnected={onConnected}
        secondaryAction={secondaryAction}
      />
    </Stack>
  );
}
