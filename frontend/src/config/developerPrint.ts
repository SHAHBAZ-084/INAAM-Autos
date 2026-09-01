export type PrintFieldKey =
  | 'logo'
  | 'businessName'
  | 'tagline'
  | 'address'
  | 'phone'
  | 'whatsapp'
  | 'taxInfo'
  | 'invoiceFooter'
  | 'returnPolicy'
  | 'productName'
  | 'variant'
  | 'price'
  | 'barcode';

export type PrintFieldConfig = {
  key: PrintFieldKey;
  label: string;
  enabled: boolean;
};

export type BarcodeCustomLine = {
  id: string;
  text: string;
  enabled: boolean;
};

export type DeveloperPrintConfig = {
  showLogoOnInvoice: boolean;
  showLogoOnBarcode: boolean;
  taxInfo: string;
  /** Shorter name for barcode labels; empty = use business settings name. */
  barcodeBusinessName: string;
  barcodeCustomLines: BarcodeCustomLine[];
  invoiceFields: PrintFieldConfig[];
  barcodeFields: PrintFieldConfig[];
};

const INVOICE_FIELD_DEFAULTS: PrintFieldConfig[] = [
  { key: 'logo', label: 'Logo', enabled: true },
  { key: 'businessName', label: 'Business name', enabled: true },
  { key: 'tagline', label: 'Tagline', enabled: true },
  { key: 'address', label: 'Address', enabled: true },
  { key: 'phone', label: 'Phone', enabled: true },
  { key: 'whatsapp', label: 'WhatsApp', enabled: true },
  { key: 'taxInfo', label: 'Tax info', enabled: false },
  { key: 'invoiceFooter', label: 'Invoice footer', enabled: true },
  { key: 'returnPolicy', label: 'Return policy', enabled: true },
];

const BARCODE_FIELD_DEFAULTS: PrintFieldConfig[] = [
  { key: 'logo', label: 'Logo', enabled: true },
  { key: 'businessName', label: 'Business name', enabled: true },
  { key: 'productName', label: 'Product name', enabled: true },
  { key: 'variant', label: 'Variant', enabled: true },
  { key: 'price', label: 'Price', enabled: true },
  { key: 'barcode', label: 'Barcode', enabled: true },
];

export const DEFAULT_DEVELOPER_CONFIG: DeveloperPrintConfig = {
  showLogoOnInvoice: true,
  showLogoOnBarcode: true,
  taxInfo: '',
  barcodeBusinessName: '',
  barcodeCustomLines: [],
  invoiceFields: INVOICE_FIELD_DEFAULTS.map((f) => ({ ...f })),
  barcodeFields: BARCODE_FIELD_DEFAULTS.map((f) => ({ ...f })),
};

function parseCustomLines(raw: unknown): BarcodeCustomLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const rec = row as Record<string, unknown>;
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      if (!text) return null;
      const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `custom-${idx + 1}`;
      return { id, text, enabled: rec.enabled !== false };
    })
    .filter((line): line is BarcodeCustomLine => line !== null);
}

export function parseDeveloperConfig(raw: unknown): DeveloperPrintConfig {
  const src = raw && typeof raw === 'object' ? (raw as Partial<DeveloperPrintConfig>) : {};
  const merge = (defaults: PrintFieldConfig[], incoming: PrintFieldConfig[] | undefined) =>
    defaults.map((def) => {
      const override = incoming?.find((f) => f.key === def.key);
      return override
        ? {
            key: def.key,
            label: override.label?.trim() || def.label,
            enabled: override.enabled !== false,
          }
        : { ...def };
    });
  const invoiceFields = merge(INVOICE_FIELD_DEFAULTS, src.invoiceFields);
  const barcodeFields = merge(BARCODE_FIELD_DEFAULTS, src.barcodeFields);
  return {
    showLogoOnInvoice: src.showLogoOnInvoice ?? invoiceFields.find((f) => f.key === 'logo')?.enabled ?? true,
    showLogoOnBarcode: src.showLogoOnBarcode ?? barcodeFields.find((f) => f.key === 'logo')?.enabled ?? true,
    taxInfo: typeof src.taxInfo === 'string' ? src.taxInfo : '',
    barcodeBusinessName: typeof src.barcodeBusinessName === 'string' ? src.barcodeBusinessName.trim() : '',
    barcodeCustomLines: parseCustomLines(src.barcodeCustomLines),
    invoiceFields,
    barcodeFields,
  };
}

export function isPrintFieldEnabled(
  config: DeveloperPrintConfig | null | undefined,
  surface: 'invoice' | 'barcode',
  key: PrintFieldKey,
): boolean {
  const cfg = parseDeveloperConfig(config);
  if (key === 'logo') {
    return surface === 'invoice' ? cfg.showLogoOnInvoice : cfg.showLogoOnBarcode;
  }
  const fields = surface === 'invoice' ? cfg.invoiceFields : cfg.barcodeFields;
  return fields.find((f) => f.key === key)?.enabled !== false;
}

export function printFieldLabel(
  config: DeveloperPrintConfig | null | undefined,
  surface: 'invoice' | 'barcode',
  key: PrintFieldKey,
): string {
  const cfg = parseDeveloperConfig(config);
  const fields = surface === 'invoice' ? cfg.invoiceFields : cfg.barcodeFields;
  return fields.find((f) => f.key === key)?.label ?? key;
}
