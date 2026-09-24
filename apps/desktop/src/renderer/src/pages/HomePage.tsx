import { Badge, Group, List, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCircleDashed } from '@tabler/icons-react';
import type { AppInfo } from '@postloom/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();
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

  const steps = ['home.stepConnect', 'home.stepTemplate', 'home.stepSend'];

  return (
    <Stack maw={760} gap="lg">
      <div>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed" mt="xs">
          {t('home.intro')}
        </Text>
      </div>
      <Paper withBorder p="lg">
        <Title order={2} size="h3" mb="md">
          {t('home.checklistTitle')}
        </Title>
        <List
          spacing="sm"
          icon={
            <ThemeIcon variant="light" color="gray" radius="xl" size={24} aria-hidden>
              <IconCircleDashed size={16} />
            </ThemeIcon>
          }
        >
          {steps.map((key) => (
            <List.Item key={key}>
              <Group gap="sm">
                <Text>{t(key)}</Text>
                <Badge variant="light" color="gray">
                  {t('home.comingSoon')}
                </Badge>
              </Group>
            </List.Item>
          ))}
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
