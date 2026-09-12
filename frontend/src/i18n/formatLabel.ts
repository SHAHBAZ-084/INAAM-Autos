import { URDU_DICTIONARY } from './urduDictionary';

export type UiLanguage = 'ENGLISH' | 'URDU' | 'BOTH';

const LOOKUP = new Map<string, string>(
  Object.entries(URDU_DICTIONARY).map(([en, ur]) => [normalizeKey(en), ur]),
);

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** Resolve Urdu for an English UI phrase (exact, case-insensitive). */
export function lookupUrdu(english: string): string | null {
  const key = normalizeKey(english);
  if (!key) return null;
  const direct = LOOKUP.get(key);
  if (direct) return direct;
  const lower = key.toLowerCase();
  for (const [en, ur] of LOOKUP) {
    if (en.toLowerCase() === lower) return ur;
  }
  return null;
}

/**
 * Format a UI label for the active language mode.
 * ENGLISH → as-is; URDU → Urdu only; BOTH → `English (اردو)`.
 */
export function formatLabel(english: string, language: UiLanguage): string {
  const source = english ?? '';
  if (!source.trim() || language === 'ENGLISH') return source;
  const urdu = lookupUrdu(source);
  if (!urdu) return source;
  if (language === 'URDU') return urdu;
  return `${source} (${urdu})`;
}

/**
 * Thermal invoice column / money-line headings.
 * In BOTH mode these stay English only — bilingual text overflows narrow receipts.
 */
const COMPACT_INVOICE_HEADINGS = new Set(['Item', 'Qty', 'Rate', 'Total', 'Subtotal']);

export function formatInvoiceTableHeading(english: string, language: UiLanguage): string {
  if (language === 'BOTH' && COMPACT_INVOICE_HEADINGS.has(english)) {
    return english;
  }
  return formatLabel(english, language);
}

export function formatLabels(values: string[], language: UiLanguage): string[] {
  return values.map((v) => formatLabel(v, language));
}
