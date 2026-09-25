import { Badge, Button, Group, List, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { AppInfo } from '@postloom/contracts';
import { IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { accountNeedsYou } from '../api/account-status';
import { useAccounts, useTemplates } from '../api/queries';
import classes from './HomePage.module.css';

interface ChecklistStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action?: ReactNode;
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const templates = useTemplates();
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.postloom.app.getInfo().then((result) => {
      if (!cancelled && result.ok) setInfo(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = accounts.data?.find((account) => !accountNeedsYou(account));
  const broken = accounts.data?.find(accountNeedsYou);
  const templateCount = templates.data?.length ?? 0;

  const steps: ChecklistStep[] = [
    {
      id: 'connect',
      title: t('home.stepConnect'),
      done: ready !== undefined,
      hint: ready
        ? t('home.stepConnectDone', { name: ready.name })
        : broken
          ? t('home.stepConnectFix', { name: broken.name })
          : t('home.stepConnectHint'),
      action: ready ? undefined : broken ? (
        <Button variant="default" onClick={() => void navigate('/senders')}>
          {t('home.stepConnectFixAction')}
        </Button>
      ) : (
        <Button onClick={() => void navigate('/setup')}>{t('home.stepConnectAction')}</Button>
      ),
    },
    {
      id: 'template',
      title: t('home.stepTemplate'),
      done: templateCount > 0,
      hint:
        templateCount > 0
          ? t('home.stepTemplateDone', { count: templateCount })
          : t('home.stepTemplateHint'),
      action:
        templateCount > 0 ? undefined : (
          <Button
            variant={ready ? 'filled' : 'default'}
            onClick={() => void navigate('/templates')}
          >
            {t('home.stepTemplateAction')}
          </Button>
        ),
    },
    {
      id: 'send',
      title: t('home.stepSend'),
      done: false,
      hint: t('home.stepSendHint'),
      action: (
        <Badge variant="light" color="gray">
          {t('home.comingSoon')}
        </Badge>
      ),
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const loading = accounts.isPending || templates.isPending;

  return (
    <Stack maw={760} gap="lg">
      <div>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed" mt="xs">
          {t('home.intro')}
        </Text>
      </div>
      <Paper withBorder p="lg" radius="lg" aria-busy={loading || undefined}>
        <Group justify="space-between" mb="md">
          <Title order={2} size="h3">
            {t('home.checklistTitle')}
          </Title>
          {!loading && (
            <Text size="sm" c="var(--pl-muted)">
              {t('home.progress', { done: doneCount, total: steps.length })}
            </Text>
          )}
        </Group>
        <ol className={classes.steps}>
          {steps.map((step, index) => (
            <li key={step.id} className={classes.step} data-done={step.done || undefined}>
              <ThemeIcon
                radius="xl"
                size={32}
                variant={step.done ? 'filled' : 'light'}
                color={step.done ? 'loom' : 'gray'}
                aria-hidden
              >
                {step.done ? <IconCheck size={18} stroke={3} /> : <span>{index + 1}</span>}
              </ThemeIcon>
              <Stack gap={2} className={classes.stepText}>
                <Text fw={650}>
                  {step.title}
                  {step.done && <span className={classes.srOnly}> ({t('home.stepDone')})</span>}
                </Text>
                <Text size="sm" c="var(--pl-muted)">
                  {step.hint}
                </Text>
              </Stack>
              {!loading && step.action}
            </li>
          ))}
        </ol>
      </Paper>
      <Paper p="lg" radius="lg" bg="var(--pl-accent-soft)">
        <Group gap="xs" mb="xs">
          <IconInfoCircle size={18} aria-hidden />
          <Text size="sm" fw={700} tt="uppercase">
            {t('home.goodToKnow')}
          </Text>
        </Group>
        <List size="sm" spacing={4}>
          <List.Item>{t('home.tipNothingSent')}</List.Item>
          <List.Item>{t('home.tipLocal')}</List.Item>
        </List>
      </Paper>
      {info && (
        <Text size="xs" c="dimmed" data-testid="app-version">
          {t('home.version', { version: info.version })}
        </Text>
      )}
    </Stack>
  );
}
