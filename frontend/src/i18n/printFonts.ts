/** Shared Urdu / bilingual print helpers (invoices, reports). */

export const URDU_PRINT_FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
`;

export const URDU_PRINT_FONT_STACK =
  "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif";

export function containsArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function isRtlUiLanguage(language: string | null | undefined): boolean {
  return language === 'URDU';
}
