import { AppShell, Group, NavLink, Text, ThemeIcon } from '@mantine/core';
import {
  IconHelp,
  IconHistory,
  IconHome,
  IconMailForward,
  IconSend,
  IconSettings,
  IconTemplate,
  IconUsers,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router';

interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<{ size?: number; stroke?: number }>;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: IconHome },
  { to: '/send', labelKey: 'nav.send', icon: IconSend },
  { to: '/templates', labelKey: 'nav.templates', icon: IconTemplate },
  { to: '/senders', labelKey: 'nav.senders', icon: IconUsers },
  { to: '/history', labelKey: 'nav.history', icon: IconHistory },
  { to: '/settings', labelKey: 'nav.settings', icon: IconSettings },
  { to: '/help', labelKey: 'nav.help', icon: IconHelp },
];

export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <AppShell navbar={{ width: 240, breakpoint: 0 }} padding="lg">
      <AppShell.Navbar p="sm" component="nav" aria-label={t('nav.label')}>
        <Group gap="xs" px="xs" pb="md">
          <ThemeIcon size="lg" radius="md" aria-hidden>
            <IconMailForward size={20} />
          </ThemeIcon>
          <div>
            <Text fw={700}>{t('app.name')}</Text>
            <Text size="xs" c="dimmed">
              {t('app.tagline')}
            </Text>
          </div>
        </Group>
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              component={RouterNavLink}
              to={to}
              label={t(labelKey)}
              leftSection={<Icon size={20} stroke={1.75} />}
              active={active}
              aria-current={active ? 'page' : undefined}
              variant="light"
            />
          );
        })}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
