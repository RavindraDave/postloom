import { Paper, Stack, Text, Title } from '@mantine/core';
import type { TemplateProblem } from '@postloom/editor';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '../components/StatusPill';
import classes from './TemplateEditor.module.css';

/** The live checklist: must-fix problems first, then things worth a look. */
export function ChecklistPanel({ problems }: { problems: TemplateProblem[] }) {
  const { t } = useTranslation();
  const sorted = [...problems].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'mustFix' ? -1 : 1,
  );
  return (
    <Paper withBorder p="md" radius="lg" component="section" aria-label={t('editor.checklist')}>
      <Title order={2} size="h5" mb="sm">
        {t('editor.checklist')}
      </Title>
      {sorted.length === 0 ? (
        <Text size="sm" fw={600} c="var(--pl-success-ink)" role="status">
          <IconCheck size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} aria-hidden />
          {t('editor.allGood')}
        </Text>
      ) : (
        <Stack gap="sm" component="ul" className={classes.checks}>
          {sorted.map((problem) => (
            <li key={`${problem.id}-${JSON.stringify(problem.values ?? {})}`}>
              <StatusPill tone={problem.severity === 'mustFix' ? 'danger' : 'warning'}>
                {t(`editor.${problem.severity}`)}
              </StatusPill>
              <Text size="sm" mt={4}>
                {t(`checks.${problem.id}`, problem.values ?? {})}
              </Text>
            </li>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
