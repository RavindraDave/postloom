import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import type { RecipientProblemInfo, SenderInfo, TemplateDetail } from '@postloom/contracts';
import { lookFromBrand, renderSubject } from '@postloom/editor';
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconInfoCircle,
  IconSend,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../api/ipc';
import {
  useCheckList,
  useEmailPreview,
  useListRow,
  useSendTemplateTest,
  useTrustFolders,
  type ListChoices,
} from '../../api/queries';
import { EmailPreview, type PreviewDevice } from '../../components/EmailPreview';
import classes from './SendPage.module.css';

interface CheckStepProps {
  choices: ListChoices & { templateId: string };
  senderId: string;
  template: TemplateDetail;
  senders: SenderInfo[];
  skipRows: number[];
  sendDuplicatesOnce: boolean;
  tested: boolean;
  onSkipRows: (rows: number[]) => void;
  onSendDuplicatesOnce: (value: boolean) => void;
  onTested: () => void;
  onMatchColumns: () => void;
  onContinue: () => void;
}

const SEVERITIES = ['mustFix', 'worthALook', 'info'] as const;
const SEVERITY_COLOR = { mustFix: 'red', worthALook: 'yellow', info: 'gray' } as const;
/** Problems whose rows can simply be left out of this send. */
const LEAVE_OUT: ReadonlySet<RecipientProblemInfo['id']> = new Set([
  'noAddress',
  'invalidAddress',
  'overDailyLimit',
  'emptyDetail',
  'attachmentMissing',
  'attachmentBlocked',
  'attachmentTooBig',
]);

/** A file size in words people know ("1.4 MB", "320 KB"). */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
const ROWS_SHOWN = 12;

/** Step 3: check everyone, fix what's wrong, and look at each person's email. */
export function CheckStep({
  choices,
  senderId,
  template,
  senders,
  skipRows,
  sendDuplicatesOnce,
  tested,
  onSkipRows,
  onSendDuplicatesOnce,
  onTested,
  onMatchColumns,
  onContinue,
}: CheckStepProps) {
  const { t } = useTranslation();
  const check = useCheckList({ ...choices, senderId, skipRows, sendDuplicatesOnce });
  const trust = useTrustFolders();
  const sender = senders.find((option) => option.id === senderId);
  const [allowWithoutTest, setAllowWithoutTest] = useState(false);

  if (check.error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle />} role="alert">
        {t(errorKey(check.error))}
      </Alert>
    );
  }
  if (!check.data) {
    return (
      <Group gap="sm">
        <Loader size="sm" />
        <Text>{t('send.check.checking')}</Text>
      </Group>
    );
  }

  const result = check.data;
  const leftOut = Object.entries(result.leftOut)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) =>
      t(`send.check.leftOut${reason.charAt(0).toUpperCase()}${reason.slice(1)}`, { count }),
    );
  const mustFix = result.problems.some((problem) => problem.severity === 'mustFix');
  const canContinue = !mustFix && result.toSendRows.length > 0 && (tested || allowWithoutTest);

  return (
    <div className={classes.checkLayout}>
      <Stack gap="md">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={6}>
            <Text fw={700} size="lg">
              {t('send.check.summary', {
                count: result.toSendRows.length,
                sender: sender?.fromName ?? '',
              })}
            </Text>
            {result.attachments.files > 0 && (
              <Text c="var(--pl-ink-soft)">
                {t('send.check.attachmentsSummary', {
                  count: result.attachments.files,
                  size: formatSize(result.attachments.bytes),
                })}
              </Text>
            )}
            {leftOut.length > 0 && (
              <Text c="var(--pl-ink-soft)">
                {t('send.check.leftOut', { list: leftOut.join(', ') })}
              </Text>
            )}
            {skipRows.length > 0 && (
              <Button
                variant="subtle"
                size="compact-sm"
                w="fit-content"
                onClick={() => {
                  onSkipRows([]);
                }}
              >
                {t('send.check.putBack')}
              </Button>
            )}
          </Stack>
        </Paper>

        {result.problems.length === 0 && (
          <Alert color="loom" icon={<IconCircleCheck />} role="status">
            {t('send.check.allGood')}
          </Alert>
        )}

        {SEVERITIES.map((severity) => {
          const problems = result.problems.filter((problem) => problem.severity === severity);
          if (problems.length === 0) return null;
          return (
            <section key={severity} aria-label={t(`send.check.${severity}`)}>
              <Title order={2} size="h4" mb="xs">
                {t(`send.check.${severity}`)}
              </Title>
              <Stack gap="xs">
                {problems.map((problem) => (
                  <ProblemCard
                    key={`${problem.id}-${String(problem.values?.['field'] ?? '')}`}
                    problem={problem}
                    sendDuplicatesOnce={sendDuplicatesOnce}
                    onLeaveOut={() => {
                      onSkipRows([...new Set([...skipRows, ...problem.rows])]);
                    }}
                    onMatchColumns={onMatchColumns}
                    onSendDuplicatesOnce={onSendDuplicatesOnce}
                    onTrustFolders={() => {
                      trust.mutate(choices.token);
                    }}
                  />
                ))}
              </Stack>
            </section>
          );
        })}

        <Stack gap="xs" align="flex-start">
          {!tested && !mustFix && result.toSendRows.length > 0 && (
            <Text c="var(--pl-ink-soft)">{t('send.check.testFirst')}</Text>
          )}
          <Group>
            <Button size="md" disabled={!canContinue} onClick={onContinue}>
              {t('send.next')}
            </Button>
            {!tested && !allowWithoutTest && !mustFix && result.toSendRows.length > 0 && (
              <Button
                variant="subtle"
                color="gray"
                onClick={() => {
                  setAllowWithoutTest(true);
                }}
              >
                {t('send.check.skipTest')}
              </Button>
            )}
          </Group>
        </Stack>
      </Stack>

      {result.toSendRows.length === 0 ? (
        <Alert color="yellow" icon={<IconAlertTriangle />} role="note">
          {t('send.check.nobody')}
        </Alert>
      ) : (
        <PersonPreview
          choices={choices}
          rows={result.toSendRows}
          template={template}
          sender={sender}
          onTested={onTested}
        />
      )}
    </div>
  );
}

function ProblemCard({
  problem,
  sendDuplicatesOnce,
  onLeaveOut,
  onMatchColumns,
  onSendDuplicatesOnce,
  onTrustFolders,
}: {
  problem: RecipientProblemInfo;
  sendDuplicatesOnce: boolean;
  onLeaveOut: () => void;
  onMatchColumns: () => void;
  onSendDuplicatesOnce: (value: boolean) => void;
  onTrustFolders: () => void;
}) {
  const { t } = useTranslation();
  const shown = problem.rows.slice(0, ROWS_SHOWN).join(', ');
  const more = problem.rows.length - ROWS_SHOWN;
  const Icon = problem.severity === 'info' ? IconInfoCircle : IconAlertTriangle;
  return (
    <Alert
      color={SEVERITY_COLOR[problem.severity]}
      icon={<Icon />}
      data-problem={problem.id}
      role={problem.severity === 'mustFix' ? 'alert' : 'note'}
    >
      <Stack gap={6}>
        <Text fw={650}>
          {t(`send.check.problems.${messageId(problem)}`, {
            count: problem.rows.length,
            ...problem.values,
          })}
        </Text>
        {problem.id === 'overDailyLimit' && <Text size="sm">{t('send.check.overLimitHelp')}</Text>}
        {problem.rows.length > 0 && (
          <Text size="sm" c="var(--pl-ink-soft)">
            {t('send.check.rows', { count: problem.rows.length, rows: shown })}
            {more > 0 && ` ${t('send.check.andMore', { count: more })}`}
          </Text>
        )}
        <Group gap="xs">
          {LEAVE_OUT.has(problem.id) && (
            <Button size="xs" variant="default" onClick={onLeaveOut}>
              {t('send.check.leaveOut')}
            </Button>
          )}
          {problem.id === 'attachmentOutside' && (
            <Button size="xs" variant="default" onClick={onTrustFolders}>
              {t('send.check.trustFolders')}
            </Button>
          )}
          {problem.id === 'missingColumn' && (
            <Button size="xs" variant="default" onClick={onMatchColumns}>
              {t('send.check.matchColumn')}
            </Button>
          )}
          {problem.id === 'duplicate' && (
            <Switch
              label={t('send.check.sendDuplicatesOnce')}
              checked={sendDuplicatesOnce}
              onChange={(event) => {
                onSendDuplicatesOnce(event.currentTarget.checked);
              }}
            />
          )}
        </Group>
      </Stack>
    </Alert>
  );
}

/** An unmatched detail with an "if empty" text only changes how personal the email is. */
function messageId(problem: RecipientProblemInfo): string {
  return problem.id === 'missingColumn' && problem.severity !== 'mustFix'
    ? 'missingColumnFallback'
    : problem.id;
}

/** Steps through the people who'll get an email, showing exactly what each gets. */
function PersonPreview({
  choices,
  rows,
  template,
  sender,
  onTested,
}: {
  choices: ListChoices;
  rows: number[];
  template: TemplateDetail;
  sender: SenderInfo | undefined;
  onTested: () => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const index = Math.min(chosen, rows.length - 1);
  const rowNo = rows[index] ?? rows[0] ?? 1;
  const row = useListRow({ ...choices, rowNo });
  const look = useMemo(
    () => lookFromBrand(sender?.brand, sender?.fromName ?? ''),
    [sender?.brand, sender?.fromName],
  );
  const values = row.data?.values ?? null;
  const preview = useEmailPreview(values ? template.document : undefined, look, values);
  const sendTest = useSendTemplateTest();
  const [sentTo, setSentTo] = useState<{ address: string; row: number } | null>(null);

  const step = (by: number) => {
    setChosen(Math.max(0, Math.min(rows.length - 1, index + by)));
  };

  return (
    <Paper withBorder radius="lg" p="lg" className={classes.preview}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={2} size="h4">
            {t('send.check.previewTitle')}
          </Title>
          <SegmentedControl
            size="xs"
            aria-label={t('templates.previewTitle')}
            value={device}
            onChange={(value) => {
              setDevice(value);
            }}
            data={[
              { value: 'desktop', label: t('templates.desktop') },
              { value: 'phone', label: t('templates.phone') },
            ]}
          />
        </Group>
        <Group gap="xs">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label={t('send.check.previous')}
            disabled={index === 0}
            onClick={() => {
              step(-1);
            }}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={650} aria-live="polite">
            {t('send.check.person', { current: index + 1, total: rows.length })}
          </Text>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label={t('send.check.nextPerson')}
            disabled={index >= rows.length - 1}
            onClick={() => {
              step(1);
            }}
          >
            <IconChevronRight size={18} />
          </ActionIcon>
          <Text size="sm" c="var(--pl-muted)">
            {t('send.check.row', { row: rowNo })}
          </Text>
        </Group>

        {row.data && (
          <dl className={classes.envelope}>
            <dt>{t('send.check.to')}</dt>
            <dd>{row.data.to.join(', ')}</dd>
            {row.data.cc.length > 0 && (
              <>
                <dt>{t('send.check.cc')}</dt>
                <dd>{row.data.cc.join(', ')}</dd>
              </>
            )}
            {row.data.bcc.length > 0 && (
              <>
                <dt>{t('send.check.bcc')}</dt>
                <dd>{row.data.bcc.join(', ')}</dd>
              </>
            )}
            <dt>{t('send.template.subject')}</dt>
            <dd>
              {renderSubject(
                template.subject,
                row.data.values,
                template.document.attrs?.detailFormats,
              ) || template.name}
            </dd>
            {row.data.attachments.length > 0 && (
              <>
                <dt>{t('send.check.attachmentsTitle')}</dt>
                <dd>
                  {row.data.attachments.map((file) => (
                    <div key={file.name}>
                      {file.name}
                      {file.problem ? (
                        <Text span c="red" size="sm">
                          {' '}
                          (
                          {t(
                            file.problem === 'missing'
                              ? 'send.check.fileMissing'
                              : 'send.check.fileBlocked',
                          )}
                          )
                        </Text>
                      ) : (
                        <Text span c="var(--pl-muted)" size="sm">
                          {' '}
                          ({formatSize(file.size)})
                        </Text>
                      )}
                    </div>
                  ))}
                </dd>
              </>
            )}
          </dl>
        )}

        {preview.data ? (
          <EmailPreview
            html={preview.data.html}
            device={device}
            title={t('templates.previewFrameTitle')}
          />
        ) : (
          <Loader size="sm" />
        )}

        {sendTest.error && (
          <Alert color="red" icon={<IconAlertTriangle />} role="alert">
            {t(errorKey(sendTest.error))}
          </Alert>
        )}
        {sentTo && (
          <Alert color="loom" icon={<IconCircleCheck />} role="status">
            {t('send.check.testSent', sentTo)}
          </Alert>
        )}
        <Button
          variant="default"
          leftSection={<IconSend size={16} />}
          loading={sendTest.isPending}
          disabled={!row.data || !sender}
          w="fit-content"
          onClick={() => {
            if (!row.data || !sender) return;
            const person = row.data;
            sendTest.mutate(
              { id: template.id, senderId: sender.id, values: person.values },
              {
                onSuccess: ({ sentTo: address }) => {
                  setSentTo({ address, row: person.rowNo });
                  onTested();
                },
              },
            );
          }}
        >
          {t('send.check.sendTest')}
        </Button>
      </Stack>
    </Paper>
  );
}
