import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { formatDeveloperCreditForPrint } from '../../config/printCredit';
import type { BusinessSettings, ExchangeResult, SaleReturn } from '../../lib/api';
import { resolveLogoDataUrl } from '../../lib/electronPrint';
import { buildSaleReceiptHeaderHtml } from './InvoicePrint';
import { parseDeveloperConfig } from '../../config/developerPrint';
import { RECEIPT_PAGE_WIDTH_MM, RECEIPT_CONTENT_WIDTH_MM } from './InvoicePrint';
import { formatLabel, formatInvoiceTableHeading, type UiLanguage } from '../../i18n/formatLabel';
import { URDU_PRINT_FONT_LINKS, URDU_PRINT_FONT_STACK, isRtlUiLanguage } from '../../i18n/printFonts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Prefer active UI language (localStorage) so print matches what the user sees. */
function langFromSettings(settings: BusinessSettings): UiLanguage {
  try {
    const stored = localStorage.getItem('inaam.uiLanguage');
    if (stored === 'URDU' || stored === 'BOTH' || stored === 'ENGLISH') return stored;
  } catch {
    /* ignore */
  }
  const raw = settings.uiLanguage;
  if (raw === 'URDU' || raw === 'BOTH' || raw === 'ENGLISH') return raw;
  return 'ENGLISH';
}

function L(settings: BusinessSettings, english: string): string {
  return formatLabel(english, langFromSettings(settings));
}

function LT(settings: BusinessSettings, english: string): string {
  return formatInvoiceTableHeading(english, langFromSettings(settings));
}

function conditionLabel(c: string, settings: BusinessSettings) {
  if (c === 'GOOD') return L(settings, 'Good');
  if (c === 'DAMAGED') return L(settings, 'Damaged');
  return L(settings, 'Other');
}

function itemLabel(item: {
  productId: number;
  product?: { name: string } | null;
  variant?: { size: string | null; colour: string | null } | null;
}): { name: string; variantHtml: string } {
  const name =
    item.product && typeof item.product === 'object' && item.product.name
      ? item.product.name
      : `Product #${item.productId}`;
  const variant = [item.variant?.size, item.variant?.colour].filter(Boolean).join('/');
  return {
    name,
    variantHtml: variant ? `<div class="variant">${escapeHtml(variant)}</div>` : '',
  };
}

export type BuildReturnReceiptHtmlOptions = {
  logoSrc?: string | null;
  /** Fallback when API did not include originalInvoiceDate. */
  originalInvoiceDate?: string | null;
};

export function buildReturnReceiptHtml(
  data: SaleReturn | ExchangeResult,
  settings: BusinessSettings,
  kind: 'return' | 'exchange',
  options: BuildReturnReceiptHtmlOptions = {},
): string {
  const isExchange = kind === 'exchange';
  const exchange = isExchange ? (data as ExchangeResult) : null;
  const saleReturn = isExchange ? null : (data as SaleReturn);
  const title = isExchange ? L(settings, 'Exchange Receipt') : L(settings, 'Return Receipt');
  const invoiceNumber = isExchange ? exchange!.invoiceNumber : saleReturn!.invoiceNumber;

  const originalDateRaw =
    data.originalInvoiceDate ?? options.originalInvoiceDate ?? null;
  const processedDateRaw = data.createdAt || data.date || new Date().toISOString();

  const returnRows = (isExchange ? exchange!.returnItems : saleReturn!.items)
    .map((item) => {
      const { name, variantHtml } = itemLabel(item);
      const cond = 'condition' in item ? conditionLabel(item.condition, settings) : L(settings, 'Good');
      return `<tr>
        <td class="col-item"><div class="item-name">${escapeHtml(name)}</div>${variantHtml}</td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-cond">${cond}</td>
        <td class="col-total">${formatMoney(item.lineTotal)}</td>
      </tr>`;
    })
    .join('');

  const newRows =
    isExchange && exchange!.newItems.length
      ? exchange!.newItems
          .map((item) => {
            const { name, variantHtml } = itemLabel(item);
            return `<tr>
        <td class="col-item"><div class="item-name">${escapeHtml(name)}</div>${variantHtml}</td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-rate">${formatMoney(item.rate)}</td>
        <td class="col-total">${formatMoney(item.lineTotal)}</td>
      </tr>`;
          })
          .join('')
      : '';

  let summary: string;
  if (isExchange && exchange) {
    const net = exchange.netAmount;
    const netLabel = net >= 0 ? L(settings, 'Customer pays') : L(settings, 'Refund to customer');
    const paidOrRefunded =
      net >= 0
        ? `<p class="row"><span>${escapeHtml(L(settings, 'Amount received'))}</span><span>Rs ${formatMoney(exchange.paidAmount)}</span></p>`
        : `<p class="row"><span>${escapeHtml(L(settings, 'Amount refunded'))}</span><span>Rs ${formatMoney(exchange.refundedAmount)}</span></p>`;
    summary = `
      <div class="rule"></div>
      <p class="row"><span>${escapeHtml(L(settings, 'Returned value'))}</span><span>Rs ${formatMoney(exchange.returnTotal)}</span></p>
      <p class="row"><span>${escapeHtml(L(settings, 'Exchange items'))}</span><span>Rs ${formatMoney(exchange.newSaleTotal)}</span></p>
      <p class="row total"><span>${escapeHtml(netLabel)}</span><span>Rs ${formatMoney(Math.abs(net))}</span></p>
      ${paidOrRefunded}`;
  } else {
    summary = `
      <div class="rule"></div>
      <p class="row"><span>${escapeHtml(L(settings, 'Returned value'))}</span><span>Rs ${formatMoney(saleReturn!.totalAmount)}</span></p>
      <p class="row total"><span>${escapeHtml(L(settings, 'Refund'))}</span><span>Rs ${formatMoney(saleReturn!.refundAmount)}</span></p>`;
  }

  const logoSrc = options.logoSrc ?? settings.logoUrl;
  const printConfig = parseDeveloperConfig(settings.developerConfig);
  const headerHtml = buildSaleReceiptHeaderHtml(settings, logoSrc, printConfig);
  const processedLabel = isExchange
    ? L(settings, 'Exchange processed:')
    : L(settings, 'Return processed:');

  const urduRtl = isRtlUiLanguage(langFromSettings(settings));
  const fontFamily = urduRtl ? URDU_PRINT_FONT_STACK : 'Arial, sans-serif';
  const bodySize = urduRtl ? '15px' : '13px';
  const tableSize = urduRtl ? '14px' : '12px';
  const htmlLangAttrs = urduRtl ? ' lang="ur" dir="rtl"' : '';
  const fontLinks = urduRtl ? URDU_PRINT_FONT_LINKS : '';

  return `<!DOCTYPE html><html${htmlLangAttrs}><head><meta charset="utf-8"/>${fontLinks}<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: ${RECEIPT_PAGE_WIDTH_MM}mm auto; margin: 0; }
  body { font-family: ${fontFamily}; font-size: ${bodySize}; color: #000; margin: 0 auto; width: ${RECEIPT_CONTENT_WIDTH_MM}mm; max-width: ${RECEIPT_CONTENT_WIDTH_MM}mm; overflow-x: hidden; font-weight: 700; padding: 1.5mm 0 2mm; }
  .logo {
    display: block;
    max-height: 75px;
    max-width: 80%;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 auto 6px;
    background: #ffffff;
  }
  .header { text-align: center; padding: 0 0 2px; }
  .shop-name { font-size: ${urduRtl ? '20px' : '18px'}; font-weight: 800; letter-spacing: ${urduRtl ? 'normal' : '0.02em'}; line-height: 1.35; word-wrap: break-word; color: #000; }
  .address { font-size: ${urduRtl ? '13px' : '11px'}; color: #000; font-weight: 700; line-height: 1.45; word-wrap: break-word; }
  .contacts { margin-top: 3px; }
  .contact { font-size: ${urduRtl ? '13px' : '11px'}; color: #000; margin: 1px 0; font-weight: 700; }
  .rule { border: none; border-top: 1.5px dashed #000; margin: 6px 0; height: 0; }
  h1 { font-size: ${urduRtl ? '18px' : '18px'}; font-weight: 800; text-align: center; margin: 0 0 4px; word-wrap: break-word; color: #000; }
  h2 { font-size: ${urduRtl ? '15px' : '14px'}; font-weight: 800; margin: 8px 0 4px; color: #000; }
  .meta { text-align: center; font-size: ${urduRtl ? '13px' : '11px'}; font-weight: 700; color: #000; margin: 2px 0; word-wrap: break-word; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 8px;
    font-size: ${tableSize};
    font-weight: 700;
    table-layout: fixed;
  }
  table.items th {
    font-size: ${tableSize};
    font-weight: 800;
    border-bottom: 2px solid #000;
    padding: 4px 2px 5px;
    vertical-align: bottom;
    color: #000;
  }
  table.items td {
    padding: 4px 2px;
    vertical-align: top;
    border-bottom: 1px dotted #000;
    font-size: ${tableSize};
    font-weight: 700;
    color: #000;
  }
  col.c-item { width: 46%; }
  col.c-qty { width: 12%; }
  col.c-cond { width: 18%; }
  col.c-total { width: 24%; }
  col.c-item-4 { width: 44%; }
  col.c-qty-4 { width: 12%; }
  col.c-rate-4 { width: 20%; }
  col.c-total-4 { width: 24%; }
  .col-item { text-align: start; word-wrap: break-word; overflow-wrap: anywhere; }
  .col-qty, .col-total, .col-rate {
    text-align: end;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .col-cond {
    text-align: center;
    white-space: nowrap;
  }
  .item-name { font-weight: 800; }
  .variant { font-size: ${urduRtl ? '12px' : '10px'}; font-weight: 700; margin-top: 1px; }
  .row { display: flex; justify-content: space-between; margin: 3px 0; gap: 4px; font-size: ${urduRtl ? '14px' : '12.5px'}; font-weight: 700; color: #000; }
  .row span:last-child { text-align: end; white-space: nowrap; }
  .total { font-weight: 800; font-size: ${urduRtl ? '16px' : '15px'}; }
  .footer { text-align: center; font-size: ${urduRtl ? '13px' : '11.5px'}; font-weight: 700; color: #000; margin-top: 10px; word-wrap: break-word; }
  .credit { text-align: center; font-size: ${urduRtl ? '12px' : '10px'}; font-weight: 700; color: #000; margin-top: 8px; }
</style></head><body>
  ${headerHtml}
  <div class="rule"></div>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(L(settings, 'Invoice:'))} ${escapeHtml(invoiceNumber)}</p>
  ${
    originalDateRaw
      ? `<p class="meta">${escapeHtml(L(settings, 'Original sale:'))} ${escapeHtml(formatDate(originalDateRaw))}</p>`
      : ''
  }
  <p class="meta">${escapeHtml(processedLabel)} ${escapeHtml(formatDateTime(processedDateRaw))}</p>
  <h2>${escapeHtml(L(settings, 'Returned items'))}</h2>
  <table class="items">
    <colgroup><col class="c-item" /><col class="c-qty" /><col class="c-cond" /><col class="c-total" /></colgroup>
    <thead><tr><th class="col-item">${escapeHtml(LT(settings, 'Item'))}</th><th class="col-qty">${escapeHtml(LT(settings, 'Qty'))}</th><th class="col-cond">${escapeHtml(L(settings, 'Cond.'))}</th><th class="col-total">${escapeHtml(LT(settings, 'Total'))}</th></tr></thead>
    <tbody>${returnRows}</tbody>
  </table>
  ${
    newRows
      ? `<h2>${escapeHtml(L(settings, 'Exchange items'))}</h2>
  <table class="items">
    <colgroup><col class="c-item-4" /><col class="c-qty-4" /><col class="c-rate-4" /><col class="c-total-4" /></colgroup>
    <thead><tr><th class="col-item">${escapeHtml(LT(settings, 'Item'))}</th><th class="col-qty">${escapeHtml(LT(settings, 'Qty'))}</th><th class="col-rate">${escapeHtml(LT(settings, 'Rate'))}</th><th class="col-total">${escapeHtml(LT(settings, 'Total'))}</th></tr></thead>
    <tbody>${newRows}</tbody>
  </table>`
      : ''
  }
  ${summary}
  <p class="footer">${escapeHtml(settings.invoiceFooter)}</p>
  <p class="credit">${escapeHtml(formatDeveloperCreditForPrint(settings.developerCreditLine))}</p>
<script>window.onload=function(){window.print();};<\/script>
</body></html>`;
}

export async function printReturnReceipt(
  data: SaleReturn | ExchangeResult,
  settings: BusinessSettings,
  kind: 'return' | 'exchange',
  options: BuildReturnReceiptHtmlOptions = {},
) {
  const logoSrc = await resolveLogoDataUrl(options.logoSrc ?? settings.logoUrl);
  const html = buildReturnReceiptHtml(data, settings, kind, { ...options, logoSrc });
  const win = window.open('', '_blank', 'width=480,height=720');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
