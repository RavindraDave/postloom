import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import type { SenderInfo } from '@postloom/contracts';
import { IconAlertTriangle, IconSend } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorKey } from '../../api/ipc';
import {
  useAccounts,
  useCheckList,
  usePreferences,
  useStartSend,
  type CheckListInput,
} from '../../api/queries';

/** "Always ask me before sending": the seconds to change your mind after pressing Send. */
export const LAST_CHANCE_SECONDS = 10;

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
  const preferences = usePreferences();
  // Seconds left before sending starts, or null when not counting down.
  const [countdown, setCountdown] = useState<number | null>(null);

  const startSending = () => {
    start.mutate(check, {
      onSuccess: (send) => void navigate(`/send/${send.id}`),
    });
  };

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      startSending();
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
    // Only the countdown drives this; startSending is the same each time for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

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
        {/* Read out once when the wait starts, not every second. */}
        <VisuallyHidden role="status" aria-live="polite">
          {countdown === null
            ? ''
            : t('send.confirm.countdownAnnounce', { count: LAST_CHANCE_SECONDS })}
        </VisuallyHidden>
        {countdown === null ? (
          <Button
            size="md"
            leftSection={<IconSend size={18} />}
            loading={start.isPending}
            disabled={!preferences.data}
            onClick={() => {
              if (preferences.data?.confirmBeforeSend) setCountdown(LAST_CHANCE_SECONDS);
              else startSending();
            }}
          >
            {t('send.confirm.send')}
          </Button>
        ) : (
          <Group>
            <Text fw={600} aria-hidden>
              {t('send.confirm.countdown', { count: countdown })}
            </Text>
            <Button
              variant="default"
              // The Send button has gone: keep the keyboard on the way to call it off.
              ref={(button) => button?.focus()}
              onClick={() => {
                setCountdown(null);
              }}
            >
              {t('send.confirm.cancel')}
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
