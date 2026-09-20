import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { labelItemsFromProduct, ProductFormPage, ProductsListPage } from './ProductPages';
import { MESSY_CUSTOM_FIELD_DEFS, MESSY_HELMET_PRODUCTS } from './messyHelmetFixtures';

vi.mock('../../lib/api', () => ({
  api: {
    listProducts: vi.fn(),
    listProductCategories: vi.fn(),
    listProductCustomFields: vi.fn(),
    getSettings: vi.fn(),
    getProduct: vi.fn(),
    listStockMovements: vi.fn(),
    logClientError: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from '../../lib/api';

function wrap(ui: React.ReactNode, route = '/products/list') {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/products/list" element={ui} />
            <Route path="/products/:id" element={ui} />
            <Route path="/products/add" element={ui} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

describe('messy Helmet product fixtures', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.mocked(api.listProductCategories).mockResolvedValue([
      { id: 99, name: 'Helmet', code: 'HEL', isActive: true },
    ]);
    vi.mocked(api.listProductCustomFields).mockResolvedValue(MESSY_CUSTOM_FIELD_DEFS);
    vi.mocked(api.getSettings).mockResolvedValue({
      businessName: 'INAAM AUTOS',
      developerCreditLine: '',
      barcodeLabelSize: '58x40',
      barcodeLabelStyle: 'builtin:standard',
      printerName: null,
    } as Awaited<ReturnType<typeof api.getSettings>>);
    vi.mocked(api.listProducts).mockResolvedValue({
      items: MESSY_HELMET_PRODUCTS,
      total: MESSY_HELMET_PRODUCTS.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      defaultLowStockLimit: 5,
    });
    vi.mocked(api.getProduct).mockResolvedValue(MESSY_HELMET_PRODUCTS[0]!);
    vi.mocked(api.listStockMovements).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    } as Awaited<ReturnType<typeof api.listStockMovements>>);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('labelItemsFromProduct never throws on messy custom fields / variants', () => {
    for (const product of MESSY_HELMET_PRODUCTS) {
      expect(() => labelItemsFromProduct(product, 'Shop', MESSY_CUSTOM_FIELD_DEFS)).not.toThrow();
      const items = labelItemsFromProduct(product, 'Shop', MESSY_CUSTOM_FIELD_DEFS);
      for (const item of items) {
        expect(typeof item.barcode).toBe('string');
        expect(item.barcode.length).toBeGreaterThan(0);
        expect(typeof item.productName).toBe('string');
      }
    }
  });

  it('renders ProductsListPage with Helmet messy fixtures without throwing', async () => {
    await act(async () => {
      root.render(wrap(<ProductsListPage />));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Helmet|ہیلمٹ|Duplicate Helmet Name/);
  });

  it('renders ProductFormPage edit with messy product without throwing', async () => {
    await act(async () => {
      root.render(wrap(<ProductFormPage mode="edit" />, '/products/1'));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Product name|Sale price|Helmet/i);
  });
});
