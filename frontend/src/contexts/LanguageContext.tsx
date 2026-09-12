import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { formatLabel, type UiLanguage } from '../i18n/formatLabel';
import { api } from '../lib/api';

const LANGUAGE_STORAGE_KEY = 'inaam.uiLanguage';

type LanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  /** Persist language to settings (developer edit session required on server). */
  persistLanguage: (language: UiLanguage) => Promise<void>;
  refreshLanguageFromServer: () => Promise<void>;
  t: (english: string) => string;
  isRtl: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): UiLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'ENGLISH' || stored === 'URDU' || stored === 'BOTH') return stored;
  } catch {
    /* ignore */
  }
  return 'ENGLISH';
}

function writeStoredLanguage(language: UiLanguage) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* ignore */
  }
}

function applyDocumentLanguage(language: UiLanguage) {
  const root = document.documentElement;
  const rtl = language === 'URDU';
  root.setAttribute('lang', rtl ? 'ur' : 'en');
  root.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  root.setAttribute('data-ui-language', language);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(readStoredLanguage);

  useEffect(() => {
    applyDocumentLanguage(language);
    writeStoredLanguage(language);
  }, [language]);

  const refreshLanguageFromServer = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      const next = settings.uiLanguage;
      if (next === 'ENGLISH' || next === 'URDU' || next === 'BOTH') {
        setLanguageState(next);
      }
    } catch {
      /* unauthenticated / offline — keep local */
    }
  }, []);

  useEffect(() => {
    void refreshLanguageFromServer();
  }, [refreshLanguageFromServer]);

  const persistLanguage = useCallback(async (next: UiLanguage) => {
    setLanguageState(next);
    writeStoredLanguage(next);
    applyDocumentLanguage(next);
    await api.updateSettings({ uiLanguage: next });
  }, []);

  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
  }, []);

  const t = useCallback((english: string) => formatLabel(english, language), [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      persistLanguage,
      refreshLanguageFromServer,
      t,
      isRtl: language === 'URDU',
    }),
    [language, setLanguage, persistLanguage, refreshLanguageFromServer, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

/** Safe translate when provider may be missing (e.g. early boot). */
export function useT() {
  const ctx = useContext(LanguageContext);
  return ctx?.t ?? ((s: string) => s);
}
