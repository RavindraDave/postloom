import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import type { EmailAccountInfo, SenderInfo } from '@postloom/contracts';
import { PROVIDER_PRESETS, type ProviderId } from '@postloom/core';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorKey } from '../api/ipc';
import { useCreateSender, useSendTestEmail } from '../api/queries';
import { ConnectAccount, useSignInFor } from '../components/ConnectAccount';
import { LoomMark } from '../components/LoomMark';
import { PasswordProtectionNotice } from '../components/PasswordProtectionNotice';
import { ProviderPicker } from '../components/ProviderPicker';
import { WizardSteps } from '../components/WizardSteps';
import classes from './SetupPage.module.css';
import { useWindowTitle } from '../components/useWindowTitle';

const STEPS = ['welcome', 'connect', 'sender', 'test', 'done'] as const;
type Step = (typeof STEPS)[number];

/** First-run setup: connect an email account, create a sender, send a test (design: Setup). */
export function SetupPage() {
  const { t } = useTranslation();
  useWindowTitle(t('setup.title'));
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  const [account, setAccount] = useState<EmailAccountInfo | null>(null);
  const [sender, setSender] = useState<SenderInfo | null>(null);

  const current = STEPS.indexOf(step);
  const later = (
    <Button variant="subtle" color="gray" onClick={() => void navigate('/')}>
      {t('setup.later')}
    </Button>
  );

  return (
    <div className={classes.page}>
      <aside className={classes.aside}>
        <Group gap="sm" mb="xl">
          <span className={classes.mark} aria-hidden>
            <LoomMark />
          </span>
          <Text fw={750} ff="var(--pl-font-display)" size="xl">
            {t('app.name')}
          </Text>
        </Group>
        <WizardSteps
          label={t('setup.stepsLabel')}
          steps={STEPS.map((id) => t(`setup.steps.${id}`))}
          current={current}
        />
        <Text size="sm" c="var(--pl-muted)" mt="auto">
          {t('setup.privacy')}
        </Text>
      </aside>

      <main className={classes.main}>
        <Stack gap="lg" maw={720}>
          <Text size="sm" fw={700} c="var(--pl-accent-ink)" tt="uppercase">
            {t('setup.step', { current: current + 1, total: STEPS.length })}
          </Text>

          {step === 'welcome' && (
            <>
              <Title order={1}>{t('setup.welcomeTitle')}</Title>
              <Text size="lg" c="var(--pl-ink-soft)">
                {t('setup.welcomeBody')}
              </Text>
              <Group justify="space-between">
                {later}
                <Button
                  size="md"
                  onClick={() => {
                    setStep('connect');
                  }}
                >
                  {t('setup.start')}
                </Button>
              </Group>
            </>
          )}

          {step === 'connect' && !providerConfirmed && (
            <>
              <Title order={1}>{t('setup.providerTitle')}</Title>
              <Text c="var(--pl-ink-soft)">{t('setup.providerBody')}</Text>
              <ProviderPicker value={provider} onChange={setProvider} />
              {provider && <ProviderNext provider={provider} />}
              <Group justify="space-between">
                {later}
                <Stack gap={4} align="flex-end">
                  <Button
                    size="md"
                    disabled={!provider}
                    onClick={() => {
                      setProviderConfirmed(true);
                    }}
                  >
                    {provider
                      ? t('setup.continueWith', {
                          provider: t(`accounts.providers.${provider}.label`),
                        })
                      : t('setup.continue')}
                  </Button>
                  {!provider && (
                    <Text size="sm" c="var(--pl-muted)">
                      {t('setup.chooseFirst')}
                    </Text>
                  )}
                </Stack>
              </Group>
            </>
          )}

          {step === 'connect' && providerConfirmed && provider && (
            <>
              <Title order={1}>
                {t('setup.connectTitle', { provider: t(`accounts.providers.${provider}.label`) })}
              </Title>
              <PasswordProtectionNotice />
              <Paper withBorder p="lg" radius="lg">
                <ConnectAccount
                  key={provider}
                  provider={provider}
                  onConnected={(connected) => {
                    setAccount(connected);
                    setStep('sender');
                  }}
                  secondaryAction={
                    <Button
                      variant="default"
                      leftSection={<IconArrowLeft size={16} />}
                      onClick={() => {
                        setProviderConfirmed(false);
                      }}
                    >
                      {t('setup.back')}
                    </Button>
                  }
                />
              </Paper>
            </>
          )}

          {step === 'sender' && account && (
            <SenderStep
              account={account}
              onCreated={(created) => {
                setSender(created);
                setStep('test');
              }}
            />
          )}

          {step === 'test' && account && (
            <TestStep
              account={account}
              onNext={() => {
                setStep('done');
              }}
            />
          )}

          {step === 'done' && account && (
            <Stack gap="lg" align="flex-start">
              <IconCircleCheck size={56} color="var(--mantine-color-loom-7)" aria-hidden />
              <Title order={1}>{t('setup.doneTitle')}</Title>
              <Text size="lg" c="var(--pl-ink-soft)">
                {t('setup.doneBody', {
                  account: account.name,
                  sender: sender?.fromName ?? account.username,
                })}
              </Text>
              <Button size="md" onClick={() => void navigate('/')}>
                {t('setup.doneAction')}
              </Button>
            </Stack>
          )}
        </Stack>
      </main>
    </div>
  );
}

function ProviderNext({ provider }: { provider: ProviderId }) {
  const { t } = useTranslation();
  const label = t(`accounts.providers.${provider}.label`);
  const needsAppPassword = PROVIDER_PRESETS[provider].needsAppPassword;
  const signIn = useSignInFor(provider);
  if (signIn) {
    return (
      <Alert color="loom" variant="light" icon={<IconInfoCircle />} role="note">
        <Text fw={650}>{t(`signIn.${signIn}.next`)}</Text>
        <Text size="sm">{t(`signIn.${signIn}.nextBody`)}</Text>
      </Alert>
    );
  }
  return (
    <Alert color="loom" variant="light" icon={<IconInfoCircle />} role="note">
      <Text fw={650}>
        {needsAppPassword
          ? t('accounts.appPasswordNext', { provider: label })
          : t('accounts.otherNext')}
      </Text>
      <Text size="sm">
        {needsAppPassword
          ? t('accounts.appPasswordNextBody', { provider: label })
          : t('accounts.otherNextBody')}
      </Text>
    </Alert>
  );
}

function SenderStep({
  account,
  onCreated,
}: {
  account: EmailAccountInfo;
  onCreated: (sender: SenderInfo) => void;
}) {
  const { t } = useTranslation();
  const createSender = useCreateSender();
  const [fromName, setFromName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const missing = fromName.trim() === '';

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSubmitted(true);
    if (missing) return;
    try {
      const sender = await createSender.mutateAsync({
        name: fromName.trim(),
        emailAccountId: account.id,
        fromName: fromName.trim(),
        fromAddress: account.username,
      });
      onCreated(sender);
    } catch {
      // Shown below.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="lg">
        <Title order={1}>{t('setup.senderTitle')}</Title>
        <Text c="var(--pl-ink-soft)">{t('setup.senderBody')}</Text>
        <Paper withBorder p="lg" radius="lg">
          <Stack gap="md">
            <TextInput
              label={t('senders.fromNameLabel')}
              description={t('senders.fromNameHint')}
              value={fromName}
              onChange={(event) => {
                setFromName(event.currentTarget.value);
              }}
              error={submitted && missing ? t('senders.fromNameMissing') : undefined}
              required
              data-autofocus
            />
            <TextInput label={t('senders.fromAddressLabel')} value={account.username} readOnly />
          </Stack>
        </Paper>
        {createSender.error && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(createSender.error))}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button type="submit" size="md" loading={createSender.isPending}>
            {t('setup.continue')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function TestStep({ account, onNext }: { account: EmailAccountInfo; onNext: () => void }) {
  const { t } = useTranslation();
  const sendTest = useSendTestEmail();

  return (
    <Stack gap="lg">
      <Title order={1}>{t('setup.testTitle')}</Title>
      <Text c="var(--pl-ink-soft)">{t('setup.testBody', { address: account.username })}</Text>
      {sendTest.isSuccess && (
        <Alert
          color="green"
          icon={<IconCircleCheck />}
          role="status"
          title={t('setup.testSentTitle')}
        >
          {t('setup.testSentBody')}
        </Alert>
      )}
      {sendTest.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(sendTest.error))}
        </Alert>
      )}
      <Group justify="space-between">
        <Button variant="subtle" color="gray" onClick={onNext}>
          {t('setup.skip')}
        </Button>
        {sendTest.isSuccess ? (
          <Button size="md" onClick={onNext}>
            {t('setup.continue')}
          </Button>
        ) : (
          <Button
            size="md"
            loading={sendTest.isPending}
            onClick={() => {
              sendTest.mutate({ id: account.id });
            }}
          >
            {t('setup.testSend')}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
