import { useMantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { usePreferences } from './api/queries';

/**
 * Applies saved preferences to the whole app: colour scheme and text size.
 * Text size scales the root font size, which every rem-based size follows.
 */
export function PreferencesEffects() {
  const { data } = usePreferences();
  const { setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    if (!data) return;
    setColorScheme(data.colorScheme);
    document.documentElement.style.fontSize = `${String(data.textScale * 100)}%`;
  }, [data, setColorScheme]);

  return null;
}
