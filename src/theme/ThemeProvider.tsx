import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_THEME_ID, THEMES } from './themes';
import type { Theme, ThemeId } from './tokens';

// v3: the original colors are back as the default, so older saved picks start fresh.
const STORAGE_KEY = 'imin.themeId.v3';

type ThemeContextValue = {
  theme: Theme;
  setThemeId: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && saved in THEMES) setThemeIdState(saved as ThemeId);
      })
      .catch(() => {
        // Storage unavailable: keep the default theme.
      });
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const value = useMemo(() => ({ theme: THEMES[themeId], setThemeId }), [themeId, setThemeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** The active theme. Components read every color, font and size from this. */
export function useTheme(): Theme {
  return useThemeContext().theme;
}
