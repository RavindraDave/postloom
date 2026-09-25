import { MantineProvider } from '@mantine/core';
import { HashRouter, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { cssVariablesResolver, theme } from './theme/theme';

export function App() {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </MantineProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="send" element={<PlaceholderPage titleKey="nav.send" />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="senders" element={<PlaceholderPage titleKey="nav.senders" />} />
        <Route path="history" element={<PlaceholderPage titleKey="nav.history" />} />
        <Route path="settings" element={<PlaceholderPage titleKey="nav.settings" />} />
        <Route path="help" element={<PlaceholderPage titleKey="nav.help" />} />
      </Route>
    </Routes>
  );
}
