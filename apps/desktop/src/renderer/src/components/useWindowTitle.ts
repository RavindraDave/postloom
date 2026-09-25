import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Names the page in the window title, which screen readers read out on a page change. */
export function useWindowTitle(page: string | null) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = page ? t('app.windowTitle', { page }) : t('app.name');
  }, [t, page]);
}
