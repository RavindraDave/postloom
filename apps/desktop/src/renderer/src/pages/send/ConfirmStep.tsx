import { Alert, Button, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import type { SenderInfo } from '@postloom/contracts';
import { IconInfoCircle, IconSend } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAccounts, useCheckList, type CheckListInput } from '../../api/queries';

interface ConfirmStepProps {
  check: CheckListInput;
  senderId: string;
  senders: SenderInfo[];
}

/** Step 4: "Send 245 emails from Office Gmail as Asha?" with a time estimate. */
export function ConfirmStep({ check, senderId, senders }: ConfirmStepProps) {
  const { t } = useTranslation();
  const result = useCheckList(check);
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
        <Alert color="loom" icon={<IconInfoCircle />} role="note">
          {t('send.confirm.comingSoon')}
        </Alert>
        <Button size="md" leftSection={<IconSend size={18} />} disabled>
          {t('send.confirm.send')}
        </Button>
      </Stack>
    </Paper>
  );
}
