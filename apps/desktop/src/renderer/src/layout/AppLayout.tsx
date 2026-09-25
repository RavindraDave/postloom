import { AppShell, NavLink } from '@mantine/core';
import {
  IconHelp,
  IconHistory,
  IconHome,
  IconSend,
  IconSettings,
  IconTemplate,
  IconUsers,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoomMark } from '../components/LoomMark';
import classes from './AppLayout.module.css';

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
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { to: '/settings', labelKey: 'nav.settings', icon: IconSettings },
  { to: '/help', labelKey: 'nav.help', icon: IconHelp },
];

export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const renderItem = ({ to, labelKey, icon: Icon }: NavItem) => {
    // Whole path segments only: '/send' must not match '/senders'.
    const active = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
    return (
      <NavLink
        key={to}
        component={RouterNavLink}
        to={to}
        label={t(labelKey)}
        leftSection={<Icon size={20} stroke={1.8} />}
        active={active}
        aria-current={active ? 'page' : undefined}
        className={classes.link}
      />
    );
  };

  return (
    <AppShell navbar={{ width: 248, breakpoint: 0 }} padding={40}>
      <AppShell.Navbar component="nav" aria-label={t('nav.label')} className={classes.navbar}>
        <div className={classes.brand}>
          <span className={classes.mark} aria-hidden>
            <LoomMark />
          </span>
          <span>
            <div className={classes.name}>{t('app.name')}</div>
            <div className={classes.tagline}>{t('app.tagline')}</div>
          </span>
        </div>
        {NAV_ITEMS.map(renderItem)}
        <div className={classes.spacer} />
        {SECONDARY_NAV_ITEMS.map(renderItem)}
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}
