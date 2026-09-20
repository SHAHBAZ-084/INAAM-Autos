/** Default INAAM AUTOS brand colors (near-black chrome + red accent). */
export const DEFAULT_PRIMARY_COLOR = '#0A0A0A';
export const DEFAULT_SECONDARY_COLOR = '#C8102E';

/** Brief teal theme experiment — never keep these as live brand colors. */
const TEAL_PRIMARY = new Set(['#0A2B2B', '#0E3D3D', '#0A3D3D']);
const TEAL_SECONDARY = new Set(['#0E6B6B', '#0D9488', '#14B8A6']);

export function normalizeHexColor(raw: string): string | null {
  const value = raw.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  return value.toUpperCase();
}

/** Map known teal experiment colors back to INAAM red/black. */
export function sanitizeBrandColors(primary: string, secondary: string): {
  primaryColor: string;
  brandColor: string;
} {
  let primaryColor = normalizeHexColor(primary) ?? DEFAULT_PRIMARY_COLOR;
  let brandColor = normalizeHexColor(secondary) ?? DEFAULT_SECONDARY_COLOR;
  if (TEAL_PRIMARY.has(primaryColor) || TEAL_SECONDARY.has(brandColor)) {
    primaryColor = DEFAULT_PRIMARY_COLOR;
    brandColor = DEFAULT_SECONDARY_COLOR;
  }
  return { primaryColor, brandColor };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_SECONDARY_COLOR;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, amount));
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Relative luminance (0–1) for WCAG-style contrast decisions. */
export function relativeLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_PRIMARY_COLOR;
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Black or white text for readable contrast on a solid fill. */
export function contrastingTextColor(backgroundHex: string): '#111111' | '#FFFFFF' {
  return relativeLuminance(backgroundHex) > 0.45 ? '#111111' : '#FFFFFF';
}

/**
 * Apply the configurable brand color across every theme token that paints
 * buttons, headers, accents, and highlights.
 */
export function applyBrandColors(primary: string, secondary: string) {
  const { primaryColor, brandColor } = sanitizeBrandColors(primary, secondary);
  const onPrimary = contrastingTextColor(primaryColor);
  const onBrand = contrastingTextColor(brandColor);
  const { r, g, b } = hexToRgb(brandColor);
  const root = document.documentElement;

  root.style.setProperty('--brand-primary', primaryColor);
  root.style.setProperty('--brand-secondary', brandColor);
  root.style.setProperty('--brand-color', brandColor);
  root.style.setProperty('--on-brand-primary', onPrimary);
  root.style.setProperty('--on-brand-secondary', onBrand);

  root.style.setProperty('--nav-bg', primaryColor);
  root.style.setProperty('--nav-border', `rgba(${r}, ${g}, ${b}, 0.28)`);
  root.style.setProperty('--fill-financial', brandColor);
  root.style.setProperty('--on-financial', onBrand);
  root.style.setProperty('--text-financial', brandColor);
  root.style.setProperty('--nav-text', onPrimary === '#FFFFFF' ? '#F5F5F5' : '#333333');
  root.style.setProperty('--nav-text-hover', onPrimary);

  root.style.setProperty('--fill-accent', brandColor);
  root.style.setProperty('--on-accent', onBrand);
  root.style.setProperty('--nav-active-bg', brandColor);
  root.style.setProperty('--nav-active-text', onBrand);
  root.style.setProperty('--nav-hover-bg', `rgba(${r}, ${g}, ${b}, 0.2)`);
  root.style.setProperty('--text-accent', brandColor);
  root.style.setProperty('--soft-gold', brandColor);
  root.style.setProperty('--voucher-journal', brandColor);
  root.style.setProperty('--bg-accent', mixHex(brandColor, '#000000', 0.72));
  root.style.setProperty('--metric-receivables-accent', brandColor);
  root.style.setProperty('--card-purchase-maal-accent', brandColor);
  root.style.setProperty('--card-invoice-history-accent', brandColor);
  root.style.setProperty('--metric-vouchers-accent', brandColor);
}

export function clearBrandColorOverrides() {
  const props = [
    '--brand-primary',
    '--brand-secondary',
    '--brand-color',
    '--on-brand-primary',
    '--on-brand-secondary',
    '--nav-bg',
    '--nav-border',
    '--fill-financial',
    '--on-financial',
    '--text-financial',
    '--nav-text',
    '--nav-text-hover',
    '--fill-accent',
    '--on-accent',
    '--nav-active-bg',
    '--nav-active-text',
    '--nav-hover-bg',
    '--text-accent',
    '--soft-gold',
    '--voucher-journal',
    '--bg-accent',
    '--metric-receivables-accent',
    '--card-purchase-maal-accent',
    '--card-invoice-history-accent',
    '--metric-vouchers-accent',
  ];
  for (const prop of props) {
    document.documentElement.style.removeProperty(prop);
  }
}
