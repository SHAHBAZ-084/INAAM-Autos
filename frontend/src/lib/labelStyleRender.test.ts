import { describe, expect, it } from 'vitest';
import {
  buildFreeformCanvasInnerHtml,
  buildFreeformPrintDocumentHtml,
  fieldEdgeGapsMm,
  resolveLabelStyleSelection,
  resolvePrintSafeFont,
  SAMPLE_FREEFORM_LABEL_ITEM,
} from './labelStyleRender';
import type { LabelStyleField } from './api';

const baseField = (overrides: Partial<LabelStyleField> = {}): LabelStyleField => ({
  id: 'f1',
  type: 'shop',
  xMm: 5,
  yMm: 2,
  widthMm: 10,
  heightMm: 6,
  fontSizePt: 11,
  ...overrides,
});

describe('buildFreeformCanvasInnerHtml', () => {
  it('renders one absolute field per entry with mm coordinates', () => {
    const html = buildFreeformCanvasInnerHtml(SAMPLE_FREEFORM_LABEL_ITEM, {
      canvasWidthMm: 50,
      canvasHeightMm: 30,
      fields: [
        {
          id: 'price',
          type: 'price',
          xMm: 5,
          yMm: 8,
          widthMm: 20,
          heightMm: 6,
          fontSizePt: 12,
        },
        {
          id: 'bc',
          type: 'barcode',
          xMm: 2,
          yMm: 16,
          widthMm: 40,
          heightMm: 12,
        },
      ],
    });
    expect(html).toContain('left:5mm;top:8mm;width:20mm;height:6mm');
    expect(html).toContain('Rs 4500');
    expect(html).not.toContain('4,500');
    expect(html).toContain('ff-barcode');
    expect(html).toContain('<svg');
  });

  it('uses literal mm for field geometry (no designer zoom / px)', () => {
    const html = buildFreeformCanvasInnerHtml(SAMPLE_FREEFORM_LABEL_ITEM, {
      canvasWidthMm: 38,
      canvasHeightMm: 28,
      fields: [baseField({ xMm: 5, widthMm: 10, yMm: 3, heightMm: 4 })],
    });
    expect(html).toContain('left:5mm');
    expect(html).toContain('width:10mm');
    expect(html).not.toMatch(/left:\s*20(?:px|mm)/);
    expect(html).not.toContain('transform:scale');
  });

  it('applies rotation transform without swapping box width/height', () => {
    const html = buildFreeformCanvasInnerHtml(SAMPLE_FREEFORM_LABEL_ITEM, {
      canvasWidthMm: 50,
      canvasHeightMm: 30,
      fields: [baseField({ rotationDeg: 90, widthMm: 12, heightMm: 5 })],
    });
    expect(html).toContain('width:12mm');
    expect(html).toContain('height:5mm');
    expect(html).toContain('transform:rotate(90deg)');
    expect(html).toContain('transform-origin:center center');
  });

  it('renders print-safe font-family and italic', () => {
    const html = buildFreeformCanvasInnerHtml(SAMPLE_FREEFORM_LABEL_ITEM, {
      canvasWidthMm: 50,
      canvasHeightMm: 30,
      fields: [
        baseField({
          fontFamily: 'Courier New',
          fontStyle: 'italic',
          fontSizePt: 11,
        }),
      ],
    });
    expect(html).toContain('font-family:"Courier New"');
    expect(html).toContain('font-style:italic');
  });

  it('defaults unknown fonts to Arial', () => {
    expect(resolvePrintSafeFont('Comic Sans')).toBe('Arial');
    expect(resolvePrintSafeFont('Georgia')).toBe('Georgia');
  });
});

describe('buildFreeformPrintDocumentHtml', () => {
  it('print HTML matches canvas inner geometry and uses @page in mm', () => {
    const style = {
      canvasWidthMm: 38,
      canvasHeightMm: 28,
      fields: [baseField({ xMm: 5, widthMm: 10, type: 'name' as const })],
    };
    const canvas = buildFreeformCanvasInnerHtml(SAMPLE_FREEFORM_LABEL_ITEM, style);
    const doc = buildFreeformPrintDocumentHtml([SAMPLE_FREEFORM_LABEL_ITEM], style);
    expect(doc).toContain(canvas);
    expect(doc).toContain('left:5mm');
    expect(doc).toContain('width:10mm');
    expect(doc).toContain('@page { size: 38mm 28mm; margin: 0; }');
    expect(doc).not.toContain('transform:scale');
    expect(doc).not.toContain('fonts.googleapis');
    expect(doc).not.toContain('@font-face');
  });
});

describe('resolveLabelStyleSelection', () => {
  it('defaults to builtin:standard', () => {
    expect(resolveLabelStyleSelection(undefined)).toBe('builtin:standard');
    expect(resolveLabelStyleSelection('')).toBe('builtin:standard');
    expect(resolveLabelStyleSelection('garbage')).toBe('builtin:standard');
  });

  it('keeps valid builtins and custom keys until styles prove missing', () => {
    expect(resolveLabelStyleSelection('builtin:priceFocus')).toBe('builtin:priceFocus');
    expect(resolveLabelStyleSelection('custom:style-1', [])).toBe('custom:style-1');
    expect(resolveLabelStyleSelection('custom:style-1', ['style-1'])).toBe('custom:style-1');
    expect(resolveLabelStyleSelection('custom:gone', ['style-1'])).toBe('builtin:standard');
  });
});

describe('fieldEdgeGapsMm', () => {
  it('reports unrotated gaps from the logical box', () => {
    const gaps = fieldEdgeGapsMm(
      baseField({ xMm: 5, yMm: 2, widthMm: 10, heightMm: 6 }),
      40,
      30,
    );
    expect(gaps.left).toBe(5);
    expect(gaps.top).toBe(2);
    expect(gaps.right).toBe(25);
    expect(gaps.bottom).toBe(22);
  });

  it('uses rotated AABB for gaps after 90°', () => {
    // 10×6 box at (5,2) → center (10,5); after 90° AABB is 6×10 → left=7, top=0
    const gaps = fieldEdgeGapsMm(
      baseField({ xMm: 5, yMm: 2, widthMm: 10, heightMm: 6, rotationDeg: 90 }),
      40,
      30,
    );
    expect(gaps.left).toBeCloseTo(7);
    expect(gaps.top).toBeCloseTo(0);
    expect(gaps.right).toBeCloseTo(27);
    expect(gaps.bottom).toBeCloseTo(20);
  });
});
