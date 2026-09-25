import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SendersPage } from './pages/SendersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { PreferencesEffects } from './PreferencesEffects';
import { cssVariablesResolver, theme } from './theme/theme';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Local IPC, not a network: no retries or refetch-on-focus storms.
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        defaultColorScheme="auto"
      >
        <Notifications position="bottom-center" />
        <PreferencesEffects />
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="setup" element={<SetupPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="send" element={<PlaceholderPage titleKey="nav.send" />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:id" element={<TemplateEditorPage />} />
        <Route path="senders" element={<SendersPage />} />
        <Route path="history" element={<PlaceholderPage titleKey="nav.history" />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<PlaceholderPage titleKey="nav.help" />} />
      </Route>
    </Routes>
  );
}
