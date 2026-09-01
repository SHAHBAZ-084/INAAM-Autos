import JsBarcode from 'jsbarcode';
import type { CustomLabelStyle, LabelStyleField } from './api';
import type { DeveloperPrintConfig } from '../config/developerPrint';
import { isPrintFieldEnabled, parseDeveloperConfig } from '../config/developerPrint';
import { packLabelsAcross, stickerPageWidthMm } from './barcodeLabels';

/** Sample product data used by the designer preview and print-path tests. */
export type FreeformLabelItem = {
  businessName: string;
  productName: string;
  size?: string | null;
  colour?: string | null;
  price: number;
  barcode: string;
  customLines?: string[];
  logoSrc?: string | null;
  showLogo?: boolean;
};

export const SAMPLE_FREEFORM_LABEL_ITEM: FreeformLabelItem = {
  businessName: 'INAAM AUTOS & SPARE PARTS',
  productName: 'Oil Filter',
  size: 'M',
  colour: 'Blue',
  price: 4500,
  barcode: '8901234567890',
};

/** Print-safe system fonts only — must match designer dropdown and print HTML. */
export const PRINT_SAFE_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
] as const;

export type PrintSafeFont = (typeof PRINT_SAFE_FONTS)[number];

export const DEFAULT_PRINT_FONT: PrintSafeFont = 'Arial';

const PRINT_SAFE_FONT_SET = new Set<string>(PRINT_SAFE_FONTS);

export function resolvePrintSafeFont(raw?: string | null): PrintSafeFont {
  if (raw && PRINT_SAFE_FONT_SET.has(raw)) return raw as PrintSafeFont;
  return DEFAULT_PRINT_FONT;
}

const BUILTIN_LAYOUT_KEYS = new Set(['standard', 'priceFocus', 'compact', 'minimal']);

/**
 * Resolve the print-dialog style selection from settings (mirrors default label size).
 * Falls back to builtin:standard when a custom style key is missing.
 */
export function resolveLabelStyleSelection(
  preferred: string | null | undefined,
  availableCustomKeys: readonly string[] = [],
): string {
  const key = preferred?.trim() || 'builtin:standard';
  if (key.startsWith('builtin:')) {
    const layout = key.slice('builtin:'.length);
    return BUILTIN_LAYOUT_KEYS.has(layout) ? key : 'builtin:standard';
  }
  if (key.startsWith('custom:')) {
    const styleKey = key.slice('custom:'.length);
    if (!styleKey) return 'builtin:standard';
    if (availableCustomKeys.length === 0) return key;
    return availableCustomKeys.includes(styleKey) ? key : 'builtin:standard';
  }
  return 'builtin:standard';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssFontFamily(family: string): string {
  // Quote multi-word names for CSS.
  return family.includes(' ') ? `"${family}"` : family;
}

function barcodeSvgMarkup(value: string, widthMm: number, heightMm: number, fontFamily: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // Height in SVG user units (not mm) — confined to the field box via CSS max-width/height.
  const barHeight = Math.max(14, Math.min(40, Math.round(heightMm * 2)));
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      displayValue: true,
      font: fontFamily,
      fontOptions: '',
      fontSize: 8,
      height: barHeight,
      margin: 0,
      width: Math.max(1, Math.min(1.6, widthMm / 32)),
      textMargin: 1,
    });
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><text x="2" y="16" font-family="${escapeHtml(fontFamily)}" font-size="8">${escapeHtml(value)}</text></svg>`;
  }
  return svg.outerHTML;
}

export function freeformFieldDisplayValue(field: LabelStyleField, item: FreeformLabelItem): string {
  switch (field.type) {
    case 'shop':
      return item.businessName;
    case 'name':
      return item.productName;
    case 'size':
      return item.size?.trim() || '';
    case 'colour':
      return item.colour?.trim() || '';
    case 'price':
      return `Rs ${Math.round(item.price)}`;
    case 'customText':
      return field.customText?.trim() || '';
    case 'barcode':
      return item.barcode;
    default:
      return '';
  }
}

/**
 * Soft check: after rotation, does the AABB of the field stick out of the canvas?
 * Does not block save — callers show a warning.
 */
export function rotatedFieldExceedsCanvas(
  field: LabelStyleField,
  canvasWidthMm: number,
  canvasHeightMm: number,
): boolean {
  const deg = ((field.rotationDeg ?? 0) % 360 + 360) % 360;
  if (deg === 0) {
    return (
      field.xMm < 0 ||
      field.yMm < 0 ||
      field.xMm + field.widthMm > canvasWidthMm + 0.001 ||
      field.yMm + field.heightMm > canvasHeightMm + 0.001
    );
  }
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bbW = field.widthMm * cos + field.heightMm * sin;
  const bbH = field.widthMm * sin + field.heightMm * cos;
  const cx = field.xMm + field.widthMm / 2;
  const cy = field.yMm + field.heightMm / 2;
  const left = cx - bbW / 2;
  const top = cy - bbH / 2;
  return left < -0.01 || top < -0.01 || left + bbW > canvasWidthMm + 0.01 || top + bbH > canvasHeightMm + 0.01;
}

/** Edge gaps (mm) from the field's visual AABB to each canvas edge. */
export function fieldEdgeGapsMm(
  field: LabelStyleField,
  canvasWidthMm: number,
  canvasHeightMm: number,
): { left: number; top: number; right: number; bottom: number } {
  const deg = ((field.rotationDeg ?? 0) % 360 + 360) % 360;
  if (deg === 0) {
    return {
      left: field.xMm,
      top: field.yMm,
      right: canvasWidthMm - (field.xMm + field.widthMm),
      bottom: canvasHeightMm - (field.yMm + field.heightMm),
    };
  }
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bbW = field.widthMm * cos + field.heightMm * sin;
  const bbH = field.widthMm * sin + field.heightMm * cos;
  const cx = field.xMm + field.widthMm / 2;
  const cy = field.yMm + field.heightMm / 2;
  const left = cx - bbW / 2;
  const top = cy - bbH / 2;
  return {
    left,
    top,
    right: canvasWidthMm - (left + bbW),
    bottom: canvasHeightMm - (top + bbH),
  };
}

function fieldBoxStyle(field: LabelStyleField): string {
  const font = resolvePrintSafeFont(field.fontFamily);
  const align = field.align ?? 'center';
  const fontSize = field.fontSizePt ?? (field.type === 'price' ? 11 : 8);
  // At very small thermal sizes, synthetic bold often garbles glyphs (e.g. LL → broken bars).
  // Keep author intent for >=10pt; below that, prefer normal weight for legibility.
  const wantBold = (field.fontWeight ?? 'bold') === 'bold';
  const weight = wantBold && fontSize >= 10 ? 700 : wantBold && fontSize < 10 ? 600 : 400;
  const style = field.fontStyle === 'italic' ? 'italic' : 'normal';
  const rot = ((field.rotationDeg ?? 0) % 360 + 360) % 360;
  const transform = rot === 0 ? '' : `transform:rotate(${rot}deg);transform-origin:center center;`;
  return [
    'position:absolute',
    `left:${field.xMm}mm`,
    `top:${field.yMm}mm`,
    `width:${field.widthMm}mm`,
    `height:${field.heightMm}mm`,
    'overflow:hidden',
    'box-sizing:border-box',
    `font-family:${cssFontFamily(font)},Arial,Helvetica,sans-serif`,
    `font-size:${fontSize}pt`,
    `font-weight:${weight}`,
    `font-style:${style}`,
    `text-align:${align}`,
    'line-height:1.15',
    'letter-spacing:0',
    'font-variant-ligatures:none',
    '-webkit-font-smoothing:antialiased',
    transform,
  ]
    .filter(Boolean)
    .join(';');
}

function freeformFieldEnabled(field: LabelStyleField, cfg: DeveloperPrintConfig): boolean {
  switch (field.type) {
    case 'shop':
      return isPrintFieldEnabled(cfg, 'barcode', 'businessName');
    case 'name':
      return isPrintFieldEnabled(cfg, 'barcode', 'productName');
    case 'size':
    case 'colour':
      return isPrintFieldEnabled(cfg, 'barcode', 'variant');
    case 'price':
      return isPrintFieldEnabled(cfg, 'barcode', 'price');
    case 'barcode':
      return isPrintFieldEnabled(cfg, 'barcode', 'barcode');
    case 'customText':
      return true;
    default:
      return true;
  }
}

export function filterFreeformStyleForBarcodeConfig(
  style: Pick<CustomLabelStyle, 'canvasWidthMm' | 'canvasHeightMm' | 'fields'>,
  cfg: DeveloperPrintConfig | null | undefined,
): Pick<CustomLabelStyle, 'canvasWidthMm' | 'canvasHeightMm' | 'fields'> {
  const parsed = parseDeveloperConfig(cfg);
  return {
    ...style,
    fields: style.fields.filter((field) => freeformFieldEnabled(field, parsed)),
  };
}

/**
 * Shared freeform field markup used by the designer preview and sticker print path.
 * All geometry is in real mm — never px or designer zoom.
 */
export function buildFreeformCanvasInnerHtml(
  item: FreeformLabelItem,
  style: Pick<CustomLabelStyle, 'canvasWidthMm' | 'canvasHeightMm' | 'fields'>,
): string {
  const logo =
    item.showLogo && item.logoSrc
      ? `<img src="${escapeHtml(item.logoSrc)}" alt="" style="position:absolute;left:1mm;top:1mm;max-height:8mm;max-width:18mm;object-fit:contain;" />`
      : '';
  const customLines = (item.customLines ?? [])
    .map(
      (line, idx) =>
        `<div class="ff-custom-line" style="position:absolute;left:1mm;top:${9 + idx * 3.2}mm;width:${Math.max(1, style.canvasWidthMm - 2)}mm;text-align:center;font-size:7pt;font-weight:700;line-height:1.1;">${escapeHtml(line)}</div>`,
    )
    .join('');

  const parts = style.fields.map((field) => {
    const align = field.align ?? 'center';
    const font = resolvePrintSafeFont(field.fontFamily);
    const box = fieldBoxStyle(field);
    const justify =
      align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

    if (field.type === 'barcode') {
      return `<div class="ff-field ff-barcode" data-field-id="${escapeHtml(field.id)}" style="${box};display:flex;align-items:center;justify-content:center;">${barcodeSvgMarkup(item.barcode, field.widthMm, field.heightMm, font)}</div>`;
    }

    const text = freeformFieldDisplayValue(field, item);
    return `<div class="ff-field" data-field-id="${escapeHtml(field.id)}" data-field-type="${escapeHtml(field.type)}" style="${box};display:flex;align-items:center;justify-content:${justify};">${escapeHtml(text)}</div>`;
  });

  return `<div class="ff-canvas" style="position:relative;width:${style.canvasWidthMm}mm;height:${style.canvasHeightMm}mm;overflow:hidden;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;">${logo}${customLines}${parts.join('')}</div>`;
}

/**
 * Full print document for freeform styles. Designer preview must use this exact HTML
 * (iframe srcdoc) so preview and printer cannot drift.
 */
export function buildFreeformPrintDocumentHtml(
  items: FreeformLabelItem[],
  style: Pick<CustomLabelStyle, 'canvasWidthMm' | 'canvasHeightMm' | 'fields'>,
  labelsAcross = 1,
  acrossGapMm = 0,
): string {
  const widthMm = style.canvasWidthMm;
  const heightMm = style.canvasHeightMm;
  const across = Math.max(1, labelsAcross);
  const gap = Math.max(0, acrossGapMm);

  const canvasFor = (item: FreeformLabelItem) => buildFreeformCanvasInnerHtml(item, style);

  if (across <= 1) {
    const pages = items
      .map(
        (item) =>
          `<div class="label-wrap" style="width:${widthMm}mm;height:${heightMm}mm;page-break-after:always;break-after:page;">${canvasFor(item)}</div>`,
      )
      .join('');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Barcode Labels freeform ${widthMm}x${heightMm}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${widthMm}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  .label-wrap:last-child { page-break-after: auto; break-after: auto; }
  .ff-canvas svg { max-width: 100%; max-height: 100%; height: auto; display: block; }
</style></head><body>${pages}</body></html>`;
  }

  const pageWidthMm = stickerPageWidthMm(widthMm, across, gap);
  const packedRows = packLabelsAcross(items, across);
  const pages = packedRows
    .map((row) => {
      const lanes = row
        .map((item) =>
          item
            ? canvasFor(item)
            : `<div class="ff-canvas ff-empty" aria-hidden="true" style="width:${widthMm}mm;height:${heightMm}mm;"></div>`,
        )
        .join('');
      return `<div class="page">${lanes}</div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Barcode Labels freeform ${widthMm}x${heightMm} x${across}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${pageWidthMm}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: ${pageWidthMm}mm ${heightMm}mm; margin: 0; }
  .page {
    width: ${pageWidthMm}mm;
    height: ${heightMm}mm;
    display: flex;
    flex-direction: row;
    gap: ${gap}mm;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .ff-canvas { flex: 0 0 ${widthMm}mm; }
  .ff-empty { visibility: hidden; }
  .ff-canvas svg { max-width: 100%; max-height: 100%; height: auto; display: block; }
</style></head><body>${pages}</body></html>`;
}
