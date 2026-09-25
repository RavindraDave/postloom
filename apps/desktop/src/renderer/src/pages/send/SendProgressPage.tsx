import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { SendProblem, SendSummary } from '@postloom/contracts';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconQuestionMark,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { errorKey } from '../../api/ipc';
import { useResolveUncertain, useSend, useSendAction, useSendProblems } from '../../api/queries';

/** The reason codes the engine records, in plain words. */
function reasonKey(errorCode: string | null): string {
  const code = (errorCode ?? '').split(':')[0] ?? '';
  const known = [
    'rejected',
    'temporary',
    'invalid',
    'template',
    'uncertainSkipped',
    'doNotEmail',
    'skipped',
    'disabled',
    'duplicate',
  ];
  if (known.includes(code)) return `progress.reasons.${code}`;
  return code ? 'progress.reasons.uncertain' : 'progress.reasons.other';
}

/** A send going out: live progress, Pause / Stop, and the result when it's done. */
export function SendProgressPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const send = useSend(id);

  if (send.error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} role="alert">
        {t(errorKey(send.error))}
      </Alert>
    );
  }
  if (!send.data) return <Loader size="sm" />;
  return <SendProgress send={send.data} />;
}

function SendProgress({ send }: { send: SendSummary }) {
  const { t } = useTranslation();
  const { counts } = send;
  const total = counts.pending + counts.sending + counts.sent + counts.failed + counts.uncertain;
  const settled = counts.sent + counts.failed + counts.uncertain;
  const showProblems = !send.running && counts.failed + counts.uncertain + counts.skipped > 0;
  const problems = useSendProblems(send.id, showProblems);

  return (
    <Stack gap="lg" maw={900}>
      <Anchor component={Link} to="/send" size="sm" c="var(--pl-ink-soft)">
        <Group gap={4} component="span">
          <IconArrowLeft size={14} aria-hidden />
          {t('progress.back')}
        </Group>
      </Anchor>
      <Stack gap={4}>
        <Title order={1}>{send.templateName}</Title>
        <Text c="var(--pl-ink-soft)">
          {t('progress.subtitle', {
            sender: send.senderName,
            account: send.accountName,
            file: send.fileName,
          })}
        </Text>
      </Stack>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Status send={send} total={total} />
          <Progress
            value={total ? (settled / total) * 100 : 100}
            size="lg"
            radius="xl"
            aria-label={t('progress.sending', { sent: counts.sent, total })}
            animated={send.running}
          />
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Count label={t('progress.counts.sent')} value={counts.sent} testId="count-sent" />
            <Count
              label={t('progress.counts.failed')}
              value={counts.failed}
              testId="count-failed"
            />
            <Count
              label={t('progress.counts.left')}
              value={counts.pending + counts.sending}
              testId="count-left"
            />
            <Count
              label={t('progress.counts.leftOut')}
              value={counts.skipped}
              testId="count-left-out"
            />
          </SimpleGrid>
          <Controls send={send} />
        </Stack>
      </Paper>

      {!send.running && counts.uncertain > 0 && <Uncertain send={send} />}

      {showProblems && problems.data && problems.data.length > 0 && (
        <ProblemTable problems={problems.data} />
      )}
    </Stack>
  );
}

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Stack gap={0}>
      <Text size="xl" fw={750} data-testid={testId}>
        {value}
      </Text>
      <Text size="sm" c="var(--pl-muted)">
        {label}
      </Text>
    </Stack>
  );
}

function Status({ send, total }: { send: SendSummary; total: number }) {
  const { t } = useTranslation();
  const { counts } = send;
  const left = counts.pending + counts.sending;

  if (send.running) {
    return (
      <Stack gap={4} aria-live="polite">
        <Text fw={700} size="lg">
          {t('progress.sending', { sent: counts.sent, total })}
        </Text>
        {send.current && (
          <Text c="var(--pl-ink-soft)">
            {t('progress.now', { row: send.current.rowNo, to: send.current.to })}
          </Text>
        )}
        {send.etaMs > 0 && (
          <Text size="sm" c="var(--pl-muted)">
            {t('progress.eta', { count: Math.max(1, Math.round(send.etaMs / 60_000)) })}
          </Text>
        )}
        <Text size="sm" c="var(--pl-muted)">
          {t('progress.keepOpen')}
        </Text>
      </Stack>
    );
  }
  if (send.status === 'finished') {
    return (
      <Stack gap={4} role="status">
        <Group gap="xs">
          <IconCircleCheck size={24} color="var(--mantine-color-loom-7)" aria-hidden />
          <Text fw={700} size="lg">
            {t('progress.done', { count: counts.sent })}
          </Text>
        </Group>
        {counts.failed > 0 && (
          <Text c="var(--pl-ink-soft)">{t('progress.doneFailed', { count: counts.failed })}</Text>
        )}
      </Stack>
    );
  }
  if (send.status === 'stopped') {
    return (
      <Text fw={700} size="lg" role="status">
        {t('progress.stopped', { count: left })}
      </Text>
    );
  }
  if (send.status === 'paused') {
    return (
      <Alert
        color={send.pauseReason === 'user' || send.pauseReason === 'sleep' ? 'gray' : 'yellow'}
        icon={<IconPlayerPause />}
        role="status"
      >
        {t(`progress.paused.${send.pauseReason ?? 'user'}`)}
      </Alert>
    );
  }
  return <Loader size="sm" />;
}

function Controls({ send }: { send: SendSummary }) {
  const { t } = useTranslation();
  const pause = useSendAction('pause');
  const resume = useSendAction('resume');
  const stop = useSendAction('stop');
  const retry = useSendAction('retryFailed');
  const [confirmStop, { open: openStop, close: closeStop }] = useDisclosure(false);
  const error = pause.error ?? resume.error ?? stop.error ?? retry.error;
  const left = send.counts.pending + send.counts.sending;
  const pausing = pause.isSuccess && send.running;

  return (
    <Stack gap="sm">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(error))}
        </Alert>
      )}
      <Group>
        {send.running && (
          <Button
            variant="default"
            leftSection={<IconPlayerPause size={16} />}
            loading={pausing}
            onClick={() => {
              pause.mutate(send.id);
            }}
          >
            {t('progress.pause')}
          </Button>
        )}
        {!send.running && send.status !== 'finished' && left > 0 && (
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            loading={resume.isPending}
            onClick={() => {
              pause.reset();
              resume.mutate(send.id);
            }}
          >
            {t('progress.resume')}
          </Button>
        )}
        {(send.running || (send.status !== 'finished' && send.status !== 'stopped')) && (
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconPlayerStop size={16} />}
            onClick={openStop}
          >
            {t('progress.stop')}
          </Button>
        )}
        {send.status === 'finished' && send.counts.failed > 0 && (
          <Button
            variant="default"
            loading={retry.isPending}
            onClick={() => {
              retry.mutate(send.id);
            }}
          >
            {t('progress.retryFailed', { count: send.counts.failed })}
          </Button>
        )}
      </Group>
      {pausing && (
        <Text size="sm" c="var(--pl-muted)">
          {t('progress.pausing')}
        </Text>
      )}
      <Modal opened={confirmStop} onClose={closeStop} title={t('progress.stopTitle')} centered>
        <Stack>
          <Text>{t('progress.stopBody')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeStop}>
              {t('progress.keepSending')}
            </Button>
            <Button
              color="red"
              onClick={() => {
                closeStop();
                stop.mutate(send.id);
              }}
            >
              {t('progress.stopConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function Uncertain({ send }: { send: SendSummary }) {
  const { t } = useTranslation();
  const resolve = useResolveUncertain();
  return (
    <Alert
      color="yellow"
      icon={<IconQuestionMark />}
      title={t('progress.uncertainTitle', { count: send.counts.uncertain })}
      role="alert"
    >
      <Stack gap="sm">
        <Text size="sm">{t('progress.uncertainBody')}</Text>
        <Group>
          <Button
            size="xs"
            variant="default"
            loading={resolve.isPending && resolve.variables.action === 'resend'}
            onClick={() => {
              resolve.mutate({ id: send.id, action: 'resend' });
            }}
          >
            {t('progress.resend')}
          </Button>
          <Button
            size="xs"
            variant="default"
            loading={resolve.isPending && resolve.variables.action === 'skip'}
            onClick={() => {
              resolve.mutate({ id: send.id, action: 'skip' });
            }}
          >
            {t('progress.skip')}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}

function ProblemTable({ problems }: { problems: SendProblem[] }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Title order={2} size="h4">
        {t('progress.problemsTitle')}
      </Title>
      <Table withTableBorder striped aria-label={t('progress.problemsTitle')}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('progress.row')}</Table.Th>
            <Table.Th>{t('progress.address')}</Table.Th>
            <Table.Th>{t('progress.why')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {problems.map((problem) => (
            <Table.Tr key={problem.rowNo}>
              <Table.Td>{problem.rowNo}</Table.Td>
              <Table.Td>{problem.to}</Table.Td>
              <Table.Td>
                {problem.status === 'uncertain'
                  ? t('progress.reasons.uncertain')
                  : t(reasonKey(problem.errorCode))}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
