import { describe, expect, it } from 'vitest';
import { applyDeveloperBarcodeToLabelItems, parseDeveloperConfig } from './developerPrint';

describe('applyDeveloperBarcodeToLabelItems', () => {
  const baseItem = {
    key: '1',
    businessName: 'INAAM AUTOS & SPARE PARTS',
    productName: 'Oil Filter',
    price: 500,
    barcode: '1234567890',
    productCode: 'OF-1',
  };

  it('applies shop-name override, custom lines, and field toggles', () => {
    const cfg = parseDeveloperConfig({
      barcodeBusinessName: 'INAAM AUTOS',
      barcodeCustomLines: [{ id: 'a', text: 'Chishtian', enabled: true }],
      barcodeFields: [
        { key: 'businessName', label: 'Shop', enabled: true },
        { key: 'productName', label: 'Name', enabled: false },
        { key: 'variant', label: 'Variant', enabled: false },
        { key: 'price', label: 'Price', enabled: true },
        { key: 'barcode', label: 'Barcode', enabled: true },
        { key: 'logo', label: 'Logo', enabled: false },
      ],
    });

    const [out] = applyDeveloperBarcodeToLabelItems(
      [{ ...baseItem, customLines: [], showShop: true, showProductName: true, showVariant: true, showPrice: true, showBarcode: true, showLogo: true, logoSrc: null }],
      {
      cfg,
      businessName: baseItem.businessName,
      logoSrc: '/logo.jpg',
      },
    );

    expect(out.businessName).toBe('INAAM AUTOS');
    expect(out.customLines).toEqual(['Chishtian']);
    expect(out.showShop).toBe(true);
    expect(out.showProductName).toBe(false);
    expect(out.showVariant).toBe(false);
    expect(out.showPrice).toBe(true);
    expect(out.showBarcode).toBe(true);
    expect(out.showLogo).toBe(false);
    expect(out.logoSrc).toBeNull();
  });
});
