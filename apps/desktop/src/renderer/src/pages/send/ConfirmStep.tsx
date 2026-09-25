import { Alert, Button, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import type { SenderInfo } from '@postloom/contracts';
import { IconAlertTriangle, IconSend } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorKey } from '../../api/ipc';
import { useAccounts, useCheckList, useStartSend, type CheckListInput } from '../../api/queries';

interface ConfirmStepProps {
  check: CheckListInput;
  senderId: string;
  senders: SenderInfo[];
}

/** Step 4: "Send 245 emails from Office Gmail as Asha?" with a time estimate. */
export function ConfirmStep({ check, senderId, senders }: ConfirmStepProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const result = useCheckList(check);
  const start = useStartSend();
  const accounts = useAccounts();
  const sender = senders.find((option) => option.id === senderId);
  const account = accounts.data?.find((option) => option.id === sender?.emailAccountId);

  if (!result.data || !sender) return <Loader size="sm" />;
  const count = result.data.toSendRows.length;
  const minutes = Math.max(1, Math.ceil((count * sender.effective.delayMs.value) / 60_000));

  return (
    <Paper withBorder radius="lg" p="xl" maw={640}>
      <Stack gap="md" align="flex-start">
        <Title order={2}>{t('send.confirm.title')}</Title>
        <Text size="lg">
          {t('send.confirm.body', {
            count,
            account: account?.name ?? sender.fromAddress,
            sender: sender.name,
          })}
        </Text>
        <Text c="var(--pl-ink-soft)">{t('send.confirm.time', { count: minutes, minutes })}</Text>
        <Text size="sm" c="var(--pl-muted)">
          {t('send.confirm.notSaved')}
        </Text>
        {start.error && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(start.error))}
          </Alert>
        )}
        <Button
          size="md"
          leftSection={<IconSend size={18} />}
          loading={start.isPending}
          onClick={() => {
            start.mutate(check, {
              onSuccess: (send) => void navigate(`/send/${send.id}`),
            });
          }}
        >
          {t('send.confirm.send')}
        </Button>
      </Stack>
    </Paper>
  );
}
