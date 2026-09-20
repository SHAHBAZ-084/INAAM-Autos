import type { Product, ProductCustomField } from '../../lib/api';

/** Messy Helmet-category style fixtures for crash-hardening tests. */
export const MESSY_CUSTOM_FIELD_DEFS: ProductCustomField[] = [
  {
    id: 1,
    key: 'helmet_size',
    label: 'Helmet size',
    fieldType: 'NUMBER',
    options: [],
    required: false,
    showOnBarcode: true,
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    key: 'finish',
    label: 'Finish',
    fieldType: 'SELECT',
    options: ['Matte', 'Gloss'],
    required: false,
    showOnBarcode: true,
    sortOrder: 2,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function baseProduct(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    id: overrides.id,
    name: overrides.name,
    productCode: overrides.productCode ?? `PC-${overrides.id}`,
    barcode: overrides.barcode ?? null,
    brand: overrides.brand ?? null,
    categoryId: overrides.categoryId === undefined ? 99 : overrides.categoryId,
    purchasePrice: overrides.purchasePrice ?? 0,
    salePrice: overrides.salePrice ?? 1500,
    currentStock: overrides.currentStock ?? 0,
    damagedStock: overrides.damagedStock ?? 0,
    lowStockLimit: overrides.lowStockLimit ?? null,
    effectiveLowStockLimit: overrides.effectiveLowStockLimit ?? 5,
    needsVariants: overrides.needsVariants ?? false,
    costNotSet: overrides.costNotSet ?? true,
    isLowStock: overrides.isLowStock ?? false,
    isOutOfStock: overrides.isOutOfStock ?? false,
    hasDamagedStock: overrides.hasDamagedStock ?? false,
    supplierId: overrides.supplierId ?? null,
    imagePath: overrides.imagePath ?? null,
    notes: overrides.notes ?? null,
    customFields: overrides.customFields ?? {},
    isActive: overrides.isActive ?? true,
    category:
      overrides.category === undefined
        ? { id: 99, name: 'Helmet', code: 'HEL', isActive: true }
        : overrides.category,
    variants: overrides.variants,
  };
}

/** Products that previously crashed ProductListRow via labelItemsFromProduct .trim(). */
export const MESSY_HELMET_PRODUCTS: Product[] = [
  baseProduct({
    id: 1,
    name: 'Helmet — numeric custom fields',
    barcode: '1000000000001',
    currentStock: 3,
    // Intentionally wrong types — defensive UI must coerce, not throw
    customFields: { helmet_size: 58 as unknown as string, finish: 'Matte' },
  }),
  baseProduct({
    id: 2,
    name: 'ہیلمٹ بڑی سائز',
    barcode: null,
    salePrice: 0,
    purchasePrice: -10,
    currentStock: -2,
    customFields: { helmet_size: null as unknown as string, finish: true as unknown as string },
    variants: [
      {
        id: 10,
        size: null,
        colour: null,
        productCode: 'V-10',
        barcode: null,
        purchasePrice: null,
        salePrice: null,
        currentStock: 0,
        damagedStock: 0,
        isLowStock: false,
        isOutOfStock: true,
      },
      {
        id: 11,
        size: 'L',
        colour: 42 as unknown as string,
        productCode: 'V-11',
        barcode: '1000000000011',
        purchasePrice: null,
        salePrice: 2200,
        currentStock: 1,
        damagedStock: 2,
        isLowStock: true,
        isOutOfStock: false,
      },
    ],
  }),
  baseProduct({
    id: 3,
    name: 'A'.repeat(240),
    barcode: '',
    category: null,
    categoryId: null,
    customFields: { helmet_size: { nest: 1 } as unknown as string },
    variants: [],
  }),
  baseProduct({
    id: 4,
    name: 'Duplicate Helmet Name',
    barcode: '1000000000004',
    customFields: {},
  }),
  baseProduct({
    id: 5,
    name: 'Duplicate Helmet Name',
    barcode: '1000000000005',
    customFields: { finish: '  ' },
  }),
];
