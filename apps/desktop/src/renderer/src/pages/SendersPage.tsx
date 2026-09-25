import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { EmailAccountInfo, SenderInfo } from '@postloom/contracts';
import { isPlausibleEmail, PROVIDER_PRESETS } from '@postloom/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { accountNeedsYou } from '../api/account-status';
import { errorKey } from '../api/ipc';
import {
  useAccounts,
  useCreateSender,
  useDeleteAccount,
  useDeleteSender,
  useSenders,
  useSendTestEmail,
  useTestAccount,
  useUpdateSender,
} from '../api/queries';
import { ConnectAccountForm } from '../components/ConnectAccountForm';
import { EmptyState } from '../components/EmptyState';
import { FixPasswordForm } from '../components/FixPasswordForm';
import { InheritedField } from '../components/InheritedField';
import { PageHeader } from '../components/PageHeader';
import { PasswordProtectionNotice } from '../components/PasswordProtectionNotice';
import { ProviderPicker } from '../components/ProviderPicker';
import { StatusPill, type StatusTone } from '../components/StatusPill';
import classes from './SendersPage.module.css';

function accountStatus(account: EmailAccountInfo): { tone: StatusTone; key: string } {
  if (accountNeedsYou(account)) return { tone: 'danger', key: 'accounts.statusNeedsYou' };
  if (account.lastTestOk) return { tone: 'success', key: 'accounts.statusWorking' };
  return { tone: 'neutral', key: 'accounts.statusNotChecked' };
}

export function SendersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const senders = useSenders();
  const [tab, setTab] = useState<string | null>('senders');
  const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const needingYou = accounts.data?.filter(accountNeedsYou).length ?? 0;
  const noAccounts = accounts.data?.length === 0;

  const newButton = (
    <Button leftSection={<IconPlus size={18} />} onClick={openCreate} disabled={noAccounts}>
      {t('senders.new')}
    </Button>
  );

  const error = accounts.error ?? senders.error;

  return (
    <Stack gap="lg">
      <PageHeader title={t('senders.title')} description={t('senders.intro')} action={newButton} />

      {error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(error))}
        </Alert>
      )}

      {(accounts.isPending || senders.isPending) && (
        <Stack gap="sm" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton height={72} radius="lg" />
          <Skeleton height={72} radius="lg" />
        </Stack>
      )}

      {noAccounts && (
        <EmptyState
          title={t('senders.noAccountsTitle')}
          description={t('senders.noAccountsBody')}
          action={<Button onClick={() => void navigate('/setup')}>{t('senders.connect')}</Button>}
        />
      )}

      {accounts.data && accounts.data.length > 0 && senders.data && (
        <Tabs value={tab} onChange={setTab} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab
              value="senders"
              rightSection={<Badge variant="light">{senders.data.length}</Badge>}
            >
              {t('senders.tabSenders')}
            </Tabs.Tab>
            <Tabs.Tab
              value="accounts"
              rightSection={
                needingYou > 0 ? (
                  <StatusPill tone="danger">
                    {t('senders.needsYou', { count: needingYou })}
                  </StatusPill>
                ) : (
                  <Badge variant="light">{accounts.data.length}</Badge>
                )
              }
            >
              {t('senders.tabAccounts')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="senders" pt="lg">
            <SendersTab
              senders={senders.data}
              accounts={accounts.data}
              chosenId={chosenId}
              onChoose={setChosenId}
              newButton={newButton}
            />
          </Tabs.Panel>
          <Tabs.Panel value="accounts" pt="lg">
            <AccountsTab accounts={accounts.data} />
          </Tabs.Panel>
        </Tabs>
      )}

      <Modal opened={creating} onClose={closeCreate} title={t('senders.newTitle')} size="lg">
        {accounts.data && (
          <SenderForm
            accounts={accounts.data}
            onDone={(sender) => {
              setChosenId(sender.id);
              setTab('senders');
              closeCreate();
            }}
          />
        )}
      </Modal>
    </Stack>
  );
}

// ------------------------------------------------------------------ Senders

function SendersTab({
  senders,
  accounts,
  chosenId,
  onChoose,
  newButton,
}: {
  senders: SenderInfo[];
  accounts: EmailAccountInfo[];
  chosenId: string | null;
  onChoose: (id: string) => void;
  newButton: ReactNode;
}) {
  const { t } = useTranslation();
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const selected = senders.find((sender) => sender.id === chosenId) ?? senders[0];

  if (!selected) {
    return (
      <EmptyState
        title={t('senders.emptyTitle')}
        description={t('senders.emptyBody')}
        action={newButton}
      />
    );
  }

  return (
    <div className={classes.layout}>
      <nav aria-label={t('senders.listLabel')} className={classes.list}>
        {senders.map((sender) => {
          const account = accountsById.get(sender.emailAccountId);
          const broken = account ? accountNeedsYou(account) : true;
          return (
            <UnstyledButton
              key={sender.id}
              className={classes.item}
              data-selected={sender.id === selected.id || undefined}
              aria-current={sender.id === selected.id ? 'true' : undefined}
              onClick={() => {
                onChoose(sender.id);
              }}
            >
              <Text fw={650}>{sender.name}</Text>
              <Text size="sm" c="var(--pl-muted)">
                {t('senders.via', { account: account?.name ?? '' })} ·{' '}
                {broken
                  ? t('accounts.statusNeedsYou')
                  : t('senders.templates', { count: sender.templateCount })}
              </Text>
            </UnstyledButton>
          );
        })}
      </nav>
      <SenderDetails key={selected.id} sender={selected} accounts={accounts} />
    </div>
  );
}

function SenderDetails({ sender, accounts }: { sender: SenderInfo; accounts: EmailAccountInfo[] }) {
  const { t } = useTranslation();
  const updateSender = useUpdateSender();
  const deleteSender = useDeleteSender();
  const account = accounts.find((candidate) => candidate.id === sender.emailAccountId);
  const [editingDelay, setEditingDelay] = useState(sender.delayMs !== null);
  const [delaySeconds, setDelaySeconds] = useState(
    Math.round((sender.delayMs ?? sender.effective.delayMs.value) / 1000),
  );

  const { delayMs, dailyLimit } = sender.effective;
  const accountName = account?.name ?? '';
  const delaySource =
    delayMs.source === 'sender'
      ? t('senders.fromSender')
      : delayMs.source === 'account'
        ? t('senders.fromAccount', { account: accountName })
        : t('senders.fromApp');
  const limitSource =
    dailyLimit.source === 'account'
      ? t('senders.limitFromAccount', { account: accountName })
      : dailyLimit.source === 'provider' && account
        ? t('senders.limitFromProvider', {
            provider: PROVIDER_PRESETS[account.provider].label,
            limit: dailyLimit.value,
          })
        : t('senders.limitFromApp');

  const saveDelay = (value: number | null) => {
    updateSender.mutate(
      { id: sender.id, delayMs: value },
      {
        onSuccess: () => {
          notifications.show({ message: t('senders.saved'), color: 'green' });
        },
      },
    );
  };

  const inUse = sender.templateCount > 0;

  return (
    <Stack gap="md" className={classes.details}>
      <Paper withBorder p="lg" radius="lg">
        <Group justify="space-between" mb="md">
          <Title order={2} size="h3">
            {sender.name}
          </Title>
          <Text size="sm" c="var(--pl-muted)">
            {t('senders.templates', { count: sender.templateCount })}
          </Text>
        </Group>
        <SenderForm accounts={accounts} sender={sender} />
      </Paper>

      <Paper withBorder p="lg" radius="lg">
        <Text size="sm" fw={700} c="var(--pl-muted)" tt="uppercase" mb="xs">
          {t('senders.pace')}
        </Text>
        <InheritedField
          label={t('senders.delayLabel')}
          source={delaySource}
          value={t('senders.seconds', { count: Math.round(delayMs.value / 1000) })}
          action={
            sender.delayMs === null ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditingDelay(true);
                }}
              >
                {t('senders.changeDelay')}
              </Button>
            ) : (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setEditingDelay(false);
                  saveDelay(null);
                }}
              >
                {t('senders.useInherited')}
              </Button>
            )
          }
        />
        {editingDelay && (
          <Group align="flex-end" mb="sm">
            <NumberInput
              label={t('senders.delayInputLabel')}
              min={0}
              max={60}
              allowDecimal={false}
              value={delaySeconds}
              onChange={(value) => {
                if (typeof value === 'number') setDelaySeconds(value);
              }}
              w={200}
            />
            <Button
              variant="default"
              loading={updateSender.isPending}
              onClick={() => {
                saveDelay(delaySeconds * 1000);
              }}
            >
              {t('senders.save')}
            </Button>
          </Group>
        )}
        <Divider my="xs" />
        <InheritedField
          label={t('senders.dailyLabel')}
          source={limitSource}
          value={String(dailyLimit.value)}
        />
      </Paper>

      <Group gap="sm">
        <Button
          variant="subtle"
          color="red"
          disabled={inUse}
          loading={deleteSender.isPending}
          onClick={() => {
            deleteSender.mutate(sender.id, {
              onSuccess: () => {
                notifications.show({ message: t('senders.deleted', { name: sender.name }) });
              },
            });
          }}
        >
          {t('senders.delete')}
        </Button>
        {inUse && (
          <Text size="sm" c="var(--pl-muted)">
            {t('senders.deleteBlocked', { count: sender.templateCount })}
          </Text>
        )}
      </Group>
      {deleteSender.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(deleteSender.error))}
        </Alert>
      )}
    </Stack>
  );
}

/** Adds a sender, or edits one when `sender` is given. */
function SenderForm({
  accounts,
  sender,
  onDone,
}: {
  accounts: EmailAccountInfo[];
  sender?: SenderInfo;
  onDone?: (sender: SenderInfo) => void;
}) {
  const { t } = useTranslation();
  const createSender = useCreateSender();
  const updateSender = useUpdateSender();
  const firstAccount = accounts[0];
  const [accountId, setAccountId] = useState(sender?.emailAccountId ?? firstAccount?.id ?? '');
  const account = accounts.find((candidate) => candidate.id === accountId);
  const [name, setName] = useState(sender?.name ?? '');
  const [fromName, setFromName] = useState(sender?.fromName ?? '');
  const [fromAddress, setFromAddress] = useState(sender?.fromAddress ?? account?.username ?? '');
  const [replyTo, setReplyTo] = useState(sender?.replyTo ?? '');
  const [submitted, setSubmitted] = useState(false);

  const problems = {
    fromName: fromName.trim() ? null : t('senders.fromNameMissing'),
    fromAddress: isPlausibleEmail(fromAddress) ? null : t('accounts.addressInvalid'),
    replyTo:
      replyTo.trim() === '' || isPlausibleEmail(replyTo) ? null : t('accounts.addressInvalid'),
  };
  const valid = !problems.fromName && !problems.fromAddress && !problems.replyTo;
  const busy = createSender.isPending || updateSender.isPending;
  const failure = createSender.error ?? updateSender.error;

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid || busy) return;
    const values = {
      name: name.trim() || fromName.trim(),
      emailAccountId: accountId,
      fromName: fromName.trim(),
      fromAddress: fromAddress.trim(),
      replyTo: replyTo.trim() || null,
    };
    try {
      const saved = sender
        ? await updateSender.mutateAsync({ id: sender.id, ...values })
        : await createSender.mutateAsync(values);
      if (sender) notifications.show({ message: t('senders.saved'), color: 'green' });
      onDone?.(saved);
    } catch {
      // Shown below.
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="md">
        <TextInput
          label={t('senders.fromNameLabel')}
          description={t('senders.fromNameHint')}
          value={fromName}
          onChange={(event) => {
            setFromName(event.currentTarget.value);
          }}
          error={submitted ? problems.fromName : undefined}
          required
          data-autofocus
        />
        <TextInput
          label={t('senders.fromAddressLabel')}
          description={t('senders.fromAddressHint')}
          type="email"
          value={fromAddress}
          onChange={(event) => {
            setFromAddress(event.currentTarget.value);
          }}
          error={submitted ? problems.fromAddress : undefined}
          required
        />
        <TextInput
          label={t('senders.replyToLabel')}
          description={t('senders.replyToHint')}
          type="email"
          value={replyTo}
          onChange={(event) => {
            setReplyTo(event.currentTarget.value);
          }}
          error={submitted ? problems.replyTo : undefined}
        />
        <Select
          label={t('senders.accountLabel')}
          data={accounts.map((option) => ({
            value: option.id,
            label: `${option.name} (${option.username})`,
          }))}
          value={accountId}
          onChange={(value) => {
            if (value) setAccountId(value);
          }}
          allowDeselect={false}
        />
        <TextInput
          label={t('senders.nameLabel')}
          description={t('senders.nameHint')}
          placeholder={fromName}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        {failure && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(failure))}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button type="submit" loading={busy}>
            {sender ? t('senders.save') : t('senders.create')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

// ----------------------------------------------------------------- Accounts

function AccountsTab({ accounts }: { accounts: EmailAccountInfo[] }) {
  const { t } = useTranslation();
  const [connecting, { open, close }] = useDisclosure(false);
  const [provider, setProvider] = useState<keyof typeof PROVIDER_PRESETS | null>(null);

  return (
    <Stack gap="md">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
      <Group>
        <Button
          variant="default"
          leftSection={<IconPlus size={18} />}
          onClick={() => {
            setProvider(null);
            open();
          }}
        >
          {t('accounts.connectAnother')}
        </Button>
      </Group>

      <Modal opened={connecting} onClose={close} title={t('accounts.connectTitle')} size="xl">
        <Stack gap="md">
          <ProviderPicker value={provider} onChange={setProvider} />
          {provider && (
            <>
              <PasswordProtectionNotice />
              <ConnectAccountForm key={provider} provider={provider} onConnected={close} />
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}

function AccountCard({ account }: { account: EmailAccountInfo }) {
  const { t, i18n } = useTranslation();
  const testAccount = useTestAccount();
  const sendTest = useSendTestEmail();
  const deleteAccount = useDeleteAccount();
  const status = accountStatus(account);
  const broken = accountNeedsYou(account);
  const inUse = account.senderCount > 0;
  const lastChecked = account.lastTestedAt
    ? t('accounts.lastChecked', {
        when: new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(account.lastTestedAt)),
      })
    : t('accounts.neverChecked');
  const actionError = testAccount.error ?? sendTest.error ?? deleteAccount.error;

  return (
    <Paper
      withBorder
      p="lg"
      radius="lg"
      className={classes.account}
      data-broken={broken || undefined}
      aria-label={account.name}
      component="section"
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="md" wrap="nowrap">
          <span className={classes.badge} aria-hidden>
            {account.provider === 'other'
              ? '@'
              : PROVIDER_PRESETS[account.provider].label.charAt(0)}
          </span>
          <Stack gap={2}>
            <Text fw={700}>{account.name}</Text>
            <Text size="sm" c="var(--pl-muted)">
              {account.username} · {t('accounts.usedBy', { count: account.senderCount })}
            </Text>
            <Text size="sm" c="var(--pl-muted)">
              {lastChecked}
            </Text>
          </Stack>
        </Group>
        <StatusPill tone={status.tone}>{t(status.key)}</StatusPill>
      </Group>

      {broken && (
        <Stack gap="sm" mt="md" className={classes.fix}>
          <Title order={3} size="h4">
            {account.hasPassword
              ? t('accounts.fixTitle', { name: account.name })
              : t('accounts.fixMissingTitle', { name: account.name })}
          </Title>
          <Text size="sm" c="var(--pl-ink-soft)">
            {account.hasPassword ? t('accounts.fixBody') : t('accounts.fixMissingBody')}
          </Text>
          <FixPasswordForm
            account={account}
            onFixed={(fixed) => {
              testAccount.mutate(fixed.id, {
                onSuccess: () => {
                  notifications.show({
                    message: t('accounts.fixed', { name: account.name }),
                    color: 'green',
                  });
                },
              });
            }}
          />
        </Stack>
      )}

      {actionError && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert" mt="md">
          {t(errorKey(actionError))}
        </Alert>
      )}

      <Group gap="sm" mt="md">
        <Button
          variant="default"
          loading={testAccount.isPending}
          onClick={() => {
            testAccount.mutate(account.id, {
              onSuccess: () => {
                notifications.show({
                  message: t('accounts.checkedOk', { name: account.name }),
                  color: 'green',
                });
              },
            });
          }}
        >
          {t('accounts.checkNow')}
        </Button>
        <Button
          variant="default"
          disabled={!account.hasPassword}
          loading={sendTest.isPending}
          onClick={() => {
            sendTest.mutate(
              { id: account.id },
              {
                onSuccess: ({ sentTo }) => {
                  notifications.show({
                    message: t('accounts.testSent', { address: sentTo }),
                    color: 'green',
                  });
                },
              },
            );
          }}
        >
          {t('accounts.sendTest')}
        </Button>
        <Button
          variant="subtle"
          color="red"
          disabled={inUse}
          loading={deleteAccount.isPending}
          onClick={() => {
            deleteAccount.mutate(account.id, {
              onSuccess: () => {
                notifications.show({ message: t('accounts.removed', { name: account.name }) });
              },
            });
          }}
        >
          {t('accounts.remove')}
        </Button>
        {inUse && (
          <Text size="sm" c="var(--pl-muted)">
            {t('accounts.removeBlocked', { count: account.senderCount })}
          </Text>
        )}
      </Group>
    </Paper>
  );
}
