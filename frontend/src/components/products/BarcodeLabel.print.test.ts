import { describe, expect, it } from 'vitest';
import { buildStickerLabelPrintHtml, type LabelItem } from './BarcodeLabel';

const sampleItem: LabelItem = {
  key: 'sample',
  businessName: 'INAAM AUTOS & SPARE PARTS',
  productName: 'Oil Filter',
  size: 'M',
  colour: 'Blue',
  price: 1200,
  barcode: '8901234567890',
  productCode: 'SH-001',
};

describe('buildStickerLabelPrintHtml', () => {
  it('labelsAcross=1 matches stable single-lane output', () => {
    const first = buildStickerLabelPrintHtml([sampleItem], 'standard', 58, 40, 1, 0);
    const second = buildStickerLabelPrintHtml([sampleItem], 'standard', 58, 40);
    expect(first).toBe(second);
    expect(first).toContain('@page {\n    size: 58mm 40mm;');
    expect(first).toContain('class="label"');
    expect(first).not.toContain('class="page"');
    expect((first.match(/class="label"/g) ?? []).length).toBe(1);
  });

  it('labelsAcross=2 repeats the same item on one page with correct width', () => {
    const html = buildStickerLabelPrintHtml([sampleItem], 'standard', 38, 28, 2, 2);
    expect(html).toContain('@page {\n    size: 78mm 28mm;');
    expect(html).toContain('class="page"');
    expect((html.match(/class="label"/g) ?? []).length).toBe(2);
    expect(html).toContain('Oil Filter');
    expect(html).toContain('8901234567890');
  });
});
