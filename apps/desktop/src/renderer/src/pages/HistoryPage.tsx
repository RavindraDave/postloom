import { Alert, Badge, Button, Loader, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import type { SendSummary } from '@postloom/contracts';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { errorKey } from '../api/ipc';
import { useSends } from '../api/queries';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

const STATUS_COLOR: Record<SendSummary['status'], string> = {
  draft: 'gray',
  ready: 'gray',
  sending: 'loom',
  paused: 'yellow',
  stopped: 'gray',
  finished: 'green',
};

/** Every send, newest first; each opens its result and report. */
export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const sends = useSends();
  const formatWhen = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <Stack gap="lg">
      <PageHeader helpTopic="history" title={t('history.title')} description={t('history.intro')} />
      {sends.error && (
        <Alert color="red" icon={<IconAlertTriangle />} role="alert">
          {t(errorKey(sends.error))}
        </Alert>
      )}
      {sends.isPending && <Loader size="sm" />}
      {sends.data?.length === 0 && (
        <EmptyState
          title={t('history.emptyTitle')}
          description={t('history.emptyBody')}
          action={
            <Button component={Link} to="/send">
              {t('history.startSending')}
            </Button>
          }
        />
      )}
      {sends.data && sends.data.length > 0 && (
        <Table striped highlightOnHover withTableBorder aria-label={t('history.listLabel')}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('history.when')}</Table.Th>
              <Table.Th>{t('history.template')}</Table.Th>
              <Table.Th>{t('history.list')}</Table.Th>
              <Table.Th ta="right">{t('history.sent')}</Table.Th>
              <Table.Th ta="right">{t('history.failed')}</Table.Th>
              <Table.Th>{t('history.status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sends.data.map((send) => {
              const when = formatWhen(send.createdAt);
              return (
                <Table.Tr
                  key={send.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void navigate(`/send/${send.id}`)}
                >
                  <Table.Td>
                    <UnstyledButton
                      component={Link}
                      to={`/send/${send.id}`}
                      aria-label={t('history.open', { template: send.templateName, when })}
                    >
                      {when}
                    </UnstyledButton>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600}>{send.templateName}</Text>
                    <Text size="sm" c="var(--pl-muted)">
                      {send.senderName}
                    </Text>
                  </Table.Td>
                  <Table.Td>{send.fileName}</Table.Td>
                  <Table.Td ta="right">{send.counts.sent}</Table.Td>
                  <Table.Td ta="right">{send.counts.failed + send.counts.uncertain}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={STATUS_COLOR[send.status]} tt="none">
                      {t(`history.statuses.${send.status}`)}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
