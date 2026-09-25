import {
  Alert,
  Anchor,
  Button,
  Group,
  List,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft, IconFileExport, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { errorKey, unwrap } from '../api/ipc';
import articles from '../help/articles.en.json';
import { PageHeader } from '../components/PageHeader';

export type HelpTopic = keyof typeof articles;
const TOPICS = Object.keys(articles) as HelpTopic[];

interface Section {
  heading: string;
  body: string[];
}

/** In-app help: short articles, searchable, plus setup again and diagnostics. */
export function HelpPage() {
  const { topic } = useParams();
  return topic && TOPICS.includes(topic as HelpTopic) ? (
    <HelpArticle topic={topic as HelpTopic} />
  ) : (
    <HelpIndex />
  );
}

function useArticle(topic: HelpTopic) {
  const { t } = useTranslation();
  return {
    title: t(`helpArticles.${topic}.title`),
    summary: t(`helpArticles.${topic}.summary`),
    sections: t(`helpArticles.${topic}.sections`, { returnObjects: true }) as Section[],
  };
}

function HelpIndex() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const info = useQuery({
    queryKey: ['appInfo'] as const,
    queryFn: () => unwrap(window.postloom.app.getInfo()),
  });
  const diagnostics = useMutation({
    mutationFn: () => unwrap(window.postloom.app.exportDiagnostics()),
  });
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = TOPICS.filter((topic) => {
    if (words.length === 0) return true;
    const text = JSON.stringify(t(`helpArticles.${topic}`, { returnObjects: true })).toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <Stack gap="lg" maw={760}>
      <PageHeader title={t('help.title')} description={t('help.intro')} />
      <TextInput
        label={t('help.search')}
        placeholder={t('help.searchPlaceholder')}
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />
      {shown.length === 0 && <Text c="var(--pl-ink-soft)">{t('help.noResults', { query })}</Text>}
      <Stack gap="xs" component="nav" aria-label={t('help.title')}>
        {shown.map((topic) => (
          <ArticleLink key={topic} topic={topic} />
        ))}
      </Stack>

      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2} maw={460}>
              <Text fw={650}>{t('help.setupAgain')}</Text>
              <Text size="sm" c="var(--pl-ink-soft)">
                {t('help.setupAgainHint')}
              </Text>
            </Stack>
            <Button variant="default" onClick={() => void navigate('/setup')}>
              {t('help.setupAgain')}
            </Button>
          </Group>
          <Group justify="space-between" align="flex-start">
            <Stack gap={2} maw={460}>
              <Text fw={650}>{t('help.diagnostics')}</Text>
              <Text size="sm" c="var(--pl-ink-soft)">
                {t('help.diagnosticsHint')}
              </Text>
            </Stack>
            <Button
              variant="default"
              leftSection={<IconFileExport size={16} />}
              loading={diagnostics.isPending}
              onClick={() => {
                diagnostics.mutate();
              }}
            >
              {t('help.diagnostics')}
            </Button>
          </Group>
          {diagnostics.data?.fileName && (
            <Text size="sm" c="var(--pl-ink-soft)" role="status">
              {t('help.diagnosticsSaved', { file: diagnostics.data.fileName })}
            </Text>
          )}
          {diagnostics.error && (
            <Alert color="red" icon={<IconAlertTriangle />} role="alert">
              {t(errorKey(diagnostics.error))}
            </Alert>
          )}
        </Stack>
      </Paper>
      {info.data && (
        <Text size="sm" c="var(--pl-muted)">
          {t('help.about', { version: info.data.version })}
        </Text>
      )}
    </Stack>
  );
}

function ArticleLink({ topic }: { topic: HelpTopic }) {
  const article = useArticle(topic);
  return (
    <UnstyledButton
      component={Link}
      to={`/help/${topic}`}
      p="md"
      style={{ border: '1px solid var(--pl-border)', borderRadius: 14 }}
    >
      <Text fw={650}>{article.title}</Text>
      <Text size="sm" c="var(--pl-ink-soft)">
        {article.summary}
      </Text>
    </UnstyledButton>
  );
}

function HelpArticle({ topic }: { topic: HelpTopic }) {
  const { t } = useTranslation();
  const article = useArticle(topic);
  return (
    <Stack gap="lg" maw={760} component="article">
      <Anchor component={Link} to="/help" size="sm" c="var(--pl-ink-soft)">
        <Group gap={4} component="span">
          <IconArrowLeft size={14} aria-hidden />
          {t('help.back')}
        </Group>
      </Anchor>
      <PageHeader title={article.title} description={article.summary} />
      {article.sections.map((section) => (
        <Stack key={section.heading} gap="xs">
          <Title order={2} size="h3">
            {section.heading}
          </Title>
          {section.body.every((line) => /^\d+\. /.test(line)) ? (
            <List type="ordered" spacing={4}>
              {section.body.map((line) => (
                <List.Item key={line}>{line.replace(/^\d+\. /, '')}</List.Item>
              ))}
            </List>
          ) : (
            section.body.map((line) => <Text key={line}>{line}</Text>)
          )}
        </Stack>
      ))}
    </Stack>
  );
}
