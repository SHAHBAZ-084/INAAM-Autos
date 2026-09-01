import { describe, expect, it } from 'vitest';
import { buildFreeformStickerHtml } from './BarcodeLabel';
import { buildFreeformCanvasInnerHtml } from '../../lib/labelStyleRender';

const style = {
  canvasWidthMm: 40,
  canvasHeightMm: 30,
  fields: [
    {
      id: 'a',
      type: 'name' as const,
      xMm: 2,
      yMm: 3,
      widthMm: 30,
      heightMm: 6,
      fontSizePt: 9,
      align: 'left' as const,
    },
    {
      id: 'b',
      type: 'barcode' as const,
      xMm: 2,
      yMm: 12,
      widthMm: 36,
      heightMm: 14,
    },
  ],
};

const item = {
  key: '1',
  businessName: 'INAAM AUTOS & SPARE PARTS',
  productName: 'Oil Filter',
  size: 'M',
  colour: 'Blue',
  price: 4500,
  barcode: '8901234567890',
  productCode: 'SH-1',
};

describe('buildFreeformStickerHtml', () => {
  it('places absolute fields at mm coordinates and renders barcode SVG for barcode type', () => {
    const html = buildFreeformStickerHtml([item], style, 1, 0);
    expect(html).toContain('left:2mm');
    expect(html).toContain('top:3mm');
    expect(html).toContain('width:30mm');
    expect(html).toContain('height:6mm');
    expect(html).toContain('Oil Filter');
    expect(html).toContain('ff-barcode');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/ff-barcode[^>]*>Rs /);
  });

  it('shares canvas markup with labelStyleRender helper', () => {
    const canvas = buildFreeformCanvasInnerHtml(item, style);
    const page = buildFreeformStickerHtml([item], style);
    expect(page).toContain(canvas);
  });
});
