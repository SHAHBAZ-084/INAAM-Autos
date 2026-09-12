import type { DeveloperPrintConfig } from '../../config/developerPrint';
import { isPrintFieldEnabled, parseDeveloperConfig } from '../../config/developerPrint';
import type { BusinessSettings } from '../../lib/api';

export type PrintHeaderInput = {
  businessName: string;
  address?: string;
  phone?: string;
  phoneLabel?: string;
  whatsapp?: string;
  whatsappLabel?: string;
  tagline?: string;
  taxInfo?: string;
  logoSrc?: string | null;
  showLogo?: boolean;
  showBusinessName?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  title: string;
  generatedAt?: string;
  dateRange?: string;
  /** Brand accent for statement-style reports (default INAAM red). */
  accentColor?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printHeaderCss(accent = '#C8102E'): string {
  return `
  .print-doc-wrap { color: #1a1a1a; }
  .print-doc-header {
    display: table;
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 0 0 3mm;
    padding: 0 0 3mm;
    border-bottom: 2px solid ${accent};
  }
  .print-hdr-row { display: table-row; }
  .print-hdr-left,
  .print-hdr-center,
  .print-hdr-right {
    display: table-cell;
    vertical-align: top;
    padding: 0 2mm;
  }
  .print-hdr-left { width: 22%; text-align: left; }
  .print-hdr-center { width: 46%; text-align: center; }
  .print-hdr-right {
    width: 32%;
    text-align: right;
    font-size: 9.5px;
    font-weight: 600;
    line-height: 1.35;
    color: #333;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .print-hdr-left-inner {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    min-height: 16mm;
    max-height: 20mm;
  }
  .print-hdr-logo {
    display: block;
    max-height: 18mm;
    max-width: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    background: #fff;
  }
  .print-hdr-logo-slot { width: 1px; height: 1px; }
  .business-name-display {
    display: block;
    text-align: center;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.01em;
    line-height: 1.2;
    color: #111;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
    margin: 0 auto;
    padding: 0 1mm;
  }
  .print-doc-title {
    display: block;
    text-align: center;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.02em;
    margin: 2mm auto 0;
    color: #111;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .print-hdr-right-line { margin: 0 0 1.5px; }
  .print-summary-row {
    display: table;
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 3mm 0;
    margin: 0 0 5mm;
  }
  .print-summary-box {
    display: table-cell;
    vertical-align: top;
    background: #f3f3f3;
    border-radius: 4px;
    padding: 3mm 3.5mm;
    font-size: 10px;
    font-weight: 600;
    color: #333;
  }
  .print-summary-box strong {
    display: block;
    font-size: 12px;
    font-weight: 800;
    color: #111;
    margin-top: 2px;
  }
  .print-table-accent th { background: ${accent} !important; color: #fff !important; }
  `;
}

export function buildPrintDocumentHeaderHtml(input: PrintHeaderInput): string {
  const showLogo = input.showLogo !== false && Boolean(input.logoSrc);
  const logo = showLogo
    ? `<img class="print-hdr-logo" src="${escapeHtml(input.logoSrc!)}" alt="" />`
    : `<div class="print-hdr-logo-slot"></div>`;

  const name =
    input.showBusinessName === false
      ? ''
      : `<div class="business-name-display">${escapeHtml(input.businessName)}</div>`;

  const title = `<div class="print-doc-title">${escapeHtml(input.title)}</div>`;

  const phoneParts: string[] = [];
  if (input.showPhone !== false) {
    if (input.phone?.trim()) {
      phoneParts.push(
        `${input.phoneLabel ? escapeHtml(input.phoneLabel) + ': ' : ''}${escapeHtml(input.phone.trim())}`,
      );
    }
    if (input.whatsapp?.trim() && input.whatsapp.trim() !== input.phone?.trim()) {
      phoneParts.push(
        `${input.whatsappLabel ? escapeHtml(input.whatsappLabel) + ': ' : ''}${escapeHtml(input.whatsapp.trim())}`,
      );
    }
  }
  const addressText =
    input.showAddress === false || !input.address?.trim() ? '' : escapeHtml(input.address.trim());

  const generated = input.generatedAt ?? new Date().toLocaleString();

  return `
  <header class="print-doc-header">
    <div class="print-hdr-row">
      <div class="print-hdr-left"><div class="print-hdr-left-inner">${logo}</div></div>
      <div class="print-hdr-center">${name}${title}</div>
      <div class="print-hdr-right">
        ${addressText ? `<div class="print-hdr-right-line">${addressText}</div>` : ''}
        ${phoneParts.map((line) => `<div class="print-hdr-right-line">${line}</div>`).join('')}
        ${input.dateRange ? `<div class="print-hdr-right-line">${escapeHtml(input.dateRange)}</div>` : ''}
        <div class="print-hdr-right-line">Generated: ${escapeHtml(generated)}</div>
      </div>
    </div>
  </header>`;
}

export function printHeaderFromSettings(
  settings: Pick<
    BusinessSettings,
    | 'businessName'
    | 'address'
    | 'phone'
    | 'phoneLabel'
    | 'whatsapp'
    | 'whatsappLabel'
    | 'tagline'
    | 'logoUrl'
    | 'developerConfig'
    | 'secondaryColor'
  >,
  opts: {
    title: string;
    logoSrc?: string | null;
    generatedAt?: string;
    dateRange?: string;
    developerConfig?: DeveloperPrintConfig | null;
  },
): PrintHeaderInput {
  const config = parseDeveloperConfig(opts.developerConfig ?? settings.developerConfig);
  return {
    businessName: settings.businessName,
    address: settings.address,
    phone: settings.phone,
    phoneLabel: settings.phoneLabel,
    whatsapp: settings.whatsapp,
    whatsappLabel: settings.whatsappLabel,
    tagline: settings.tagline,
    taxInfo: config.taxInfo,
    logoSrc: opts.logoSrc ?? settings.logoUrl,
    showLogo: isPrintFieldEnabled(config, 'invoice', 'logo'),
    showBusinessName: isPrintFieldEnabled(config, 'invoice', 'businessName'),
    showAddress: isPrintFieldEnabled(config, 'invoice', 'address'),
    showPhone: isPrintFieldEnabled(config, 'invoice', 'phone') || isPrintFieldEnabled(config, 'invoice', 'whatsapp'),
    title: opts.title,
    generatedAt: opts.generatedAt,
    dateRange: opts.dateRange,
    accentColor: settings.secondaryColor || '#C8102E',
  };
}
