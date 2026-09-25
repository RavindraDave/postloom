// Fonts are bundled with the app (no network, and the CSP allows only 'self').
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './i18n/i18n';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
