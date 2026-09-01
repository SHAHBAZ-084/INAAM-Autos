/** Display and internal identifiers for this POS instance. */

export const APP_DISPLAY_NAME = 'INAAM AUTOS & SPARE PARTS';
export const APP_SHORT_NAME = 'INAAM AUTOS';
export const APP_TAGLINE = 'Quality Auto Parts, Trusted Service';
export const APP_INVOICE_FOOTER = 'Thank you for shopping at INAAM AUTOS & SPARE PARTS';
export const APP_INVOICE_PREFIX = 'IA-';

/** Bundled default logo (INAAM AUTOS) — used before settings load and as fallback. */
export const APP_DEFAULT_LOGO = '/logo.jpg';

export const SETTINGS_UPDATED_EVENT = 'inaam-autos-settings-updated';
export const LEGACY_SETTINGS_UPDATED_EVENT = 'usman-mall-settings-updated';

export const THEME_STORAGE_KEY = 'inaam-autos-theme';
export const LEGACY_THEME_STORAGE_KEYS = ['usman-mall-theme', 'usman-garments-theme'] as const;

export function dispatchSettingsUpdated() {
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
}

export function onSettingsUpdated(handler: () => void): () => void {
  window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
  window.addEventListener(LEGACY_SETTINGS_UPDATED_EVENT, handler);
  return () => {
    window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
    window.removeEventListener(LEGACY_SETTINGS_UPDATED_EVENT, handler);
  };
}

export type ElectronDesktopApi = NonNullable<Window['inaamAutos']>;

export function getDesktopApi(): ElectronDesktopApi | undefined {
  return window.inaamAutos ?? window.usmanGarments;
}
