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
  invoiceFields: INVOICE_FIELD_DEFAULTS,
  barcodeFields: BARCODE_FIELD_DEFAULTS,
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

const KNOWN_KEYS = new Set<PrintFieldKey>([
  'logo',
  'businessName',
  'tagline',
  'address',
  'phone',
  'whatsapp',
  'taxInfo',
  'invoiceFooter',
  'returnPolicy',
  'productName',
  'variant',
  'price',
  'barcode',
]);

function mergeFields(defaults: PrintFieldConfig[], incoming: unknown): PrintFieldConfig[] {
  const byKey = new Map<string, PrintFieldConfig>();
  if (Array.isArray(incoming)) {
    for (const row of incoming) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const key = typeof rec.key === 'string' ? rec.key : '';
      if (!KNOWN_KEYS.has(key as PrintFieldKey)) continue;
      byKey.set(key, {
        key: key as PrintFieldKey,
        label: typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : key,
        enabled: rec.enabled !== false,
      });
    }
  }
  return defaults.map((def) => {
    const override = byKey.get(def.key);
    return override ? { ...def, ...override, key: def.key } : { ...def };
  });
}

export function parseDeveloperConfig(raw: unknown): DeveloperPrintConfig {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>;
  }

  const invoiceFields = mergeFields(INVOICE_FIELD_DEFAULTS, parsed.invoiceFields);
  const barcodeFields = mergeFields(BARCODE_FIELD_DEFAULTS, parsed.barcodeFields);
  const logoInvoice = invoiceFields.find((f) => f.key === 'logo');
  const logoBarcode = barcodeFields.find((f) => f.key === 'logo');

  return {
    showLogoOnInvoice:
      typeof parsed.showLogoOnInvoice === 'boolean'
        ? parsed.showLogoOnInvoice
        : logoInvoice?.enabled ?? true,
    showLogoOnBarcode:
      typeof parsed.showLogoOnBarcode === 'boolean'
        ? parsed.showLogoOnBarcode
        : logoBarcode?.enabled ?? true,
    taxInfo: typeof parsed.taxInfo === 'string' ? parsed.taxInfo.trim() : '',
    barcodeBusinessName:
      typeof parsed.barcodeBusinessName === 'string' ? parsed.barcodeBusinessName.trim() : '',
    barcodeCustomLines: parseCustomLines(parsed.barcodeCustomLines),
    invoiceFields,
    barcodeFields,
  };
}

export function stringifyDeveloperConfig(config: DeveloperPrintConfig): string {
  const normalized = parseDeveloperConfig(config);
  const invoiceLogo = normalized.invoiceFields.find((f) => f.key === 'logo');
  const barcodeLogo = normalized.barcodeFields.find((f) => f.key === 'logo');
  if (invoiceLogo) invoiceLogo.enabled = normalized.showLogoOnInvoice;
  if (barcodeLogo) barcodeLogo.enabled = normalized.showLogoOnBarcode;
  return JSON.stringify(normalized);
}

export function isPrintFieldEnabled(config: DeveloperPrintConfig, surface: 'invoice' | 'barcode', key: PrintFieldKey): boolean {
  if (key === 'logo') {
    return surface === 'invoice' ? config.showLogoOnInvoice : config.showLogoOnBarcode;
  }
  const fields = surface === 'invoice' ? config.invoiceFields : config.barcodeFields;
  return fields.find((f) => f.key === key)?.enabled !== false;
}

export function printFieldLabel(config: DeveloperPrintConfig, surface: 'invoice' | 'barcode', key: PrintFieldKey): string {
  const fields = surface === 'invoice' ? config.invoiceFields : config.barcodeFields;
  return fields.find((f) => f.key === key)?.label ?? key;
}
