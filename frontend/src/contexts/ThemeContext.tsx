import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { LEGACY_THEME_STORAGE_KEYS, THEME_STORAGE_KEY } from '../config/brand';
import { api } from '../lib/api';
import {
  applyBrandColors,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
} from '../lib/brandColors';

export type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  refreshThemeFromServer: () => Promise<void>;
  primaryColor: string;
  secondaryColor: string;
  applyBrandTheme: (primary: string, secondary: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    const stored =
      localStorage.getItem(THEME_STORAGE_KEY) ??
      LEGACY_THEME_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ??
      null;
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function writeStoredTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    for (const key of LEGACY_THEME_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY_COLOR);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyBrandColors(primaryColor, secondaryColor);
  }, [primaryColor, secondaryColor]);

  const applyBrandTheme = useCallback((primary: string, secondary: string) => {
    setPrimaryColor(primary);
    setSecondaryColor(secondary);
    applyBrandColors(primary, secondary);
  }, []);

  const persistTheme = useCallback(async (next: ThemeMode) => {
    setThemeState(next);
    writeStoredTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      await api.updateSettings({ themeMode: next });
    } catch {
      /* not logged in or offline — localStorage remains source until next sync */
    }
  }, []);

  const refreshThemeFromServer = useCallback(async () => {
    try {
      try {
        const branding = await api.getPublicBranding();
        if (branding.themeMode === 'light' || branding.themeMode === 'dark') {
          setThemeState(branding.themeMode);
        }
        if (branding.primaryColor) setPrimaryColor(branding.primaryColor);
        if (branding.secondaryColor) setSecondaryColor(branding.secondaryColor);
      } catch {
        /* public branding unavailable */
      }
      const settings = await api.getSettings();
      if (settings.themeMode === 'light' || settings.themeMode === 'dark') {
        setThemeState(settings.themeMode);
      }
      if (settings.primaryColor) setPrimaryColor(settings.primaryColor);
      if (settings.secondaryColor) setSecondaryColor(settings.secondaryColor);
    } catch {
      /* ignore when unauthenticated — public branding already applied */
    }
  }, []);

  useEffect(() => {
    void refreshThemeFromServer();
  }, [refreshThemeFromServer]);

  const setTheme = (next: ThemeMode) => {
    void persistTheme(next);
  };
  const toggleTheme = () => {
    void persistTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        refreshThemeFromServer,
        primaryColor,
        secondaryColor,
        applyBrandTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
