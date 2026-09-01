import fs from 'fs';
import path from 'path';
import { Prisma, ReceiptSize, ThemeMode } from '@prisma/client';
import {
  APP_DISPLAY_NAME,
  APP_INVOICE_FOOTER,
  APP_INVOICE_PREFIX,
  APP_TAGLINE,
  DEFAULT_BRAND_COLOR,
  DEFAULT_PRIMARY_COLOR,
  LEGACY_BUSINESS_NAME,
  LEGACY_INVOICE_FOOTER,
  LEGACY_INVOICE_PREFIX,
  LEGACY_PRIMARY_COLOR,
  LEGACY_SECONDARY_COLOR,
  LEGACY_TAGLINE,
} from '../../config/brand';
import { getUploadsDir as resolveUploadsDir } from '../../config/paths';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  DEFAULT_DEVELOPER_CONFIG,
  parseDeveloperConfig,
  stringifyDeveloperConfig,
  type DeveloperPrintConfig,
} from './developer-config';
import { isValidBarcodeLabelSize, normalizeBarcodeLabelSize } from './label-size';
import { assertIdentityFieldsEditable, ensureDeveloperPassphraseHash } from './identity-access.service';

export { PROTECTED_BUSINESS_IDENTITY_FIELDS } from './protected-fields';

export const BUSINESS_SETTINGS_ID = 1;

export const DEFAULT_BUSINESS_SETTINGS = {
  businessName: APP_DISPLAY_NAME,
  tagline: APP_TAGLINE,
  ownerName: '',
  phoneLabel: 'M Arslan',
  phone: '03024979697',
  whatsappLabel: 'M Usman',
  whatsapp: '03006195469',
  address: 'Bano Bazar Al Nissa Road Near Taleem Un Nisa Madrasa Chishtian',
  invoiceFooter: APP_INVOICE_FOOTER,
  returnPolicy:
    'Returns accepted within 7 days with original receipt. Items must be unused and in original condition.',
  invoicePrefix: APP_INVOICE_PREFIX,
  currency: 'PKR',
  receiptSize: ReceiptSize.THERMAL_80,
  a4InvoiceEnabled: true,
  printerName: null as string | null,
  barcodeLabelSize: '58x40',
  barcodeLabelStyle: 'builtin:standard',
  lowStockLimit: 5,
  backupFolderPath: '',
  themeMode: ThemeMode.DARK,
  logoPath: null as string | null,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_BRAND_COLOR,
  developerCreditLine: 'AS Solutions | Ali & Shahbaz | 0322-0726006',
  developerConfig: stringifyDeveloperConfig(DEFAULT_DEVELOPER_CONFIG),
};

const LEGACY_ADDRESS = 'Al-Nisa Road, Chishtian';
const LEGACY_PHONE = '0300-6195469';
const LEGACY_CREDIT = 'AS Solutions — Ali & Shahbaz — 0322-0726006';

/** Split "Name 0300…" contact strings into label + number. */
function splitContactNameFromNumber(raw: string): { label: string; number: string } | null {
  const value = raw.trim();
  if (!/[A-Za-z]/.test(value)) return null;
  const match = /^(.*?)\s*([\d+\-\s()]{7,20})$/.exec(value);
  if (!match) return null;
  return {
    label: (match[1] ?? '').trim(),
    number: (match[2] ?? value).trim(),
  };
}

export type BusinessSettingsUpdateInput = {
  businessName?: string;
  tagline?: string;
  ownerName?: string;
  phoneLabel?: string;
  phone?: string;
  whatsappLabel?: string;
  whatsapp?: string;
  address?: string;
  invoiceFooter?: string;
  returnPolicy?: string;
  invoicePrefix?: string;
  currency?: string;
  receiptSize?: ReceiptSize;
  a4InvoiceEnabled?: boolean;
  printerName?: string | null;
  barcodeLabelSize?: string;
  barcodeLabelStyle?: string;
  lowStockLimit?: number;
  backupFolderPath?: string;
  themeMode?: ThemeMode;
  logoPath?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  developerCreditLine?: string;
  developerConfig?: DeveloperPrintConfig | string;
};

function normalizeHexColor(raw: string, field: string): string {
  const value = raw.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new AppError(400, `${field} must be a hex color like #111111`);
  }
  return value.toUpperCase();
}

function serializeSettings(row: {
  id: number;
  businessName: string;
  tagline: string;
  ownerName: string;
  phone: string;
  whatsapp: string;
  address: string;
  invoiceFooter: string;
  returnPolicy: string;
  invoicePrefix: string;
  currency: string;
  receiptSize: ReceiptSize;
  a4InvoiceEnabled: boolean;
  printerName: string | null;
  barcodeLabelSize: string;
  barcodeLabelStyle: string;
  lowStockLimit: number;
  backupFolderPath: string;
  themeMode: ThemeMode;
  primaryColor: string;
  secondaryColor: string;
  logoPath: string | null;
  isIdentityLocked: boolean;
  developerPassphraseHash: string;
  developerCreditLine: string;
  developerConfig?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const {
    developerPassphraseHash: _hash,
    isIdentityLocked: _locked,
    developerConfig: rawDeveloperConfig,
    ...safe
  } = row;
  return {
    ...safe,
    themeMode: row.themeMode === ThemeMode.DARK ? 'dark' : 'light',
    logoUrl: row.logoPath ? `/uploads/${path.basename(row.logoPath)}` : null,
    developerConfig: parseDeveloperConfig(rawDeveloperConfig),
  };
}

export function publicBrandingFromSettings(settings: Awaited<ReturnType<typeof getBusinessSettings>>) {
  return {
    businessName: settings.businessName,
    tagline: settings.tagline,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    themeMode: settings.themeMode,
  };
}

/** Ensure the singleton settings row exists. Never creates a second row. */
export async function ensureBusinessSettings() {
  const existing = await prisma.businessSettings.findUnique({
    where: { id: BUSINESS_SETTINGS_ID },
  });
  if (existing) {
    const patch: Prisma.BusinessSettingsUpdateInput = {};
    if (existing.address.trim() === LEGACY_ADDRESS) {
      patch.address = DEFAULT_BUSINESS_SETTINGS.address;
    }
    if (existing.phone.trim() === LEGACY_PHONE) {
      patch.phone = DEFAULT_BUSINESS_SETTINGS.phone;
      patch.whatsapp = DEFAULT_BUSINESS_SETTINGS.whatsapp;
      patch.phoneLabel = DEFAULT_BUSINESS_SETTINGS.phoneLabel;
      patch.whatsappLabel = DEFAULT_BUSINESS_SETTINGS.whatsappLabel;
    }
    const phoneSplit = splitContactNameFromNumber(existing.phone);
    if (phoneSplit) {
      patch.phone = phoneSplit.number;
      patch.phoneLabel =
        phoneSplit.label ||
        (existing as { phoneLabel?: string }).phoneLabel ||
        DEFAULT_BUSINESS_SETTINGS.phoneLabel;
    }
    const whatsappSplit = splitContactNameFromNumber(existing.whatsapp);
    if (whatsappSplit) {
      patch.whatsapp = whatsappSplit.number;
      patch.whatsappLabel =
        whatsappSplit.label ||
        (existing as { whatsappLabel?: string }).whatsappLabel ||
        DEFAULT_BUSINESS_SETTINGS.whatsappLabel;
    }
    if (existing.developerCreditLine.trim() === LEGACY_CREDIT || /[\u2014\u2013]/.test(existing.developerCreditLine)) {
      patch.developerCreditLine = DEFAULT_BUSINESS_SETTINGS.developerCreditLine;
    }
    if (existing.businessName.trim() === LEGACY_BUSINESS_NAME) {
      patch.businessName = DEFAULT_BUSINESS_SETTINGS.businessName;
    }
    if (existing.tagline.trim() === LEGACY_TAGLINE) {
      patch.tagline = DEFAULT_BUSINESS_SETTINGS.tagline;
    }
    if (existing.invoiceFooter.trim() === LEGACY_INVOICE_FOOTER) {
      patch.invoiceFooter = DEFAULT_BUSINESS_SETTINGS.invoiceFooter;
    }
    if (existing.invoicePrefix.trim() === LEGACY_INVOICE_PREFIX) {
      patch.invoicePrefix = DEFAULT_BUSINESS_SETTINGS.invoicePrefix;
    }
    if (
      existing.primaryColor.toUpperCase() === LEGACY_PRIMARY_COLOR &&
      existing.secondaryColor.toUpperCase() === LEGACY_SECONDARY_COLOR
    ) {
      patch.primaryColor = DEFAULT_BUSINESS_SETTINGS.primaryColor;
      patch.secondaryColor = DEFAULT_BUSINESS_SETTINGS.secondaryColor;
      if (existing.themeMode === ThemeMode.LIGHT) {
        patch.themeMode = ThemeMode.DARK;
      }
    }
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.businessSettings.update({
        where: { id: BUSINESS_SETTINGS_ID },
        data: patch,
      });
      await ensureDeveloperPassphraseHash();
      return updated;
    }
    await ensureDeveloperPassphraseHash();
    return existing;
  }

  const count = await prisma.businessSettings.count();
  if (count > 0) {
    throw new AppError(500, 'Business settings integrity error: unexpected extra rows');
  }

  const row = await prisma.businessSettings.create({
    data: {
      id: BUSINESS_SETTINGS_ID,
      ...DEFAULT_BUSINESS_SETTINGS,
    },
  });
  await ensureDeveloperPassphraseHash();
  return row;
}

export async function getBusinessSettings() {
  const row = await ensureBusinessSettings();
  return serializeSettings(row);
}

export async function updateBusinessSettings(
  input: BusinessSettingsUpdateInput,
  options?: { identityEditActive?: boolean },
) {
  await ensureBusinessSettings();
  assertIdentityFieldsEditable(input, Boolean(options?.identityEditActive));

  const data: Prisma.BusinessSettingsUpdateInput = {};

  if (input.businessName !== undefined) data.businessName = input.businessName.trim();
  if (input.tagline !== undefined) data.tagline = input.tagline.trim();
  if (input.ownerName !== undefined) data.ownerName = input.ownerName.trim();
  if (input.phoneLabel !== undefined) data.phoneLabel = input.phoneLabel.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim();
  if (input.whatsappLabel !== undefined) data.whatsappLabel = input.whatsappLabel.trim();
  if (input.whatsapp !== undefined) data.whatsapp = input.whatsapp.trim();
  if (input.address !== undefined) data.address = input.address.trim();
  if (input.invoiceFooter !== undefined) data.invoiceFooter = input.invoiceFooter.trim();
  if (input.returnPolicy !== undefined) data.returnPolicy = input.returnPolicy.trim();
  if (input.invoicePrefix !== undefined) data.invoicePrefix = input.invoicePrefix.trim();
  if (input.currency !== undefined) data.currency = input.currency.trim().toUpperCase();
  if (input.receiptSize !== undefined) data.receiptSize = input.receiptSize;
  if (input.a4InvoiceEnabled !== undefined) data.a4InvoiceEnabled = input.a4InvoiceEnabled;
  if (input.printerName !== undefined) {
    data.printerName = input.printerName?.trim() ? input.printerName.trim() : null;
  }
  if (input.barcodeLabelSize !== undefined) {
    const normalized = normalizeBarcodeLabelSize(input.barcodeLabelSize);
    if (!isValidBarcodeLabelSize(normalized)) {
      throw new AppError(
        400,
        'Barcode label size must be a preset (58x40, 33x23, 40x30, 50x25, 50x30, a4) or custom WxH in mm',
      );
    }
    data.barcodeLabelSize = normalized;
  }
  if (input.barcodeLabelStyle !== undefined) {
    const styleKey = input.barcodeLabelStyle.trim();
    if (!styleKey || styleKey.length > 80) {
      throw new AppError(400, 'Barcode label style must be 1–80 characters');
    }
    const builtinOk = /^builtin:(standard|priceFocus|compact|minimal)$/.test(styleKey);
    const customOk = /^custom:.+/.test(styleKey);
    if (!builtinOk && !customOk) {
      throw new AppError(
        400,
        'Barcode label style must be builtin:standard|priceFocus|compact|minimal or custom:<key>',
      );
    }
    data.barcodeLabelStyle = styleKey;
  }
  if (input.lowStockLimit !== undefined) data.lowStockLimit = input.lowStockLimit;
  if (input.backupFolderPath !== undefined) data.backupFolderPath = input.backupFolderPath.trim();
  if (input.themeMode !== undefined) data.themeMode = input.themeMode;
  if (input.logoPath !== undefined) data.logoPath = input.logoPath;
  if (input.primaryColor !== undefined) {
    data.primaryColor = normalizeHexColor(input.primaryColor, 'Primary color');
  }
  if (input.secondaryColor !== undefined) {
    data.secondaryColor = normalizeHexColor(input.secondaryColor, 'Secondary color');
  }
  if (input.developerCreditLine !== undefined) {
    data.developerCreditLine = input.developerCreditLine.trim();
  }
  if (input.developerConfig !== undefined) {
    data.developerConfig = stringifyDeveloperConfig(parseDeveloperConfig(input.developerConfig));
  }

  if (data.businessName === '') {
    throw new AppError(400, 'Business name is required');
  }
  if (typeof data.lowStockLimit === 'number' && (!Number.isInteger(data.lowStockLimit) || data.lowStockLimit < 1)) {
    throw new AppError(400, 'Low stock limit must be a positive integer');
  }

  const row = await prisma.businessSettings.update({
    where: { id: BUSINESS_SETTINGS_ID },
    data,
  });
  return serializeSettings(row);
}

export function getUploadsDir() {
  return resolveUploadsDir();
}

export async function saveBusinessLogo(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}) {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.mimetype)) {
    throw new AppError(400, 'Logo must be a PNG, JPEG, WEBP, or GIF image');
  }
  if (file.buffer.length > 2 * 1024 * 1024) {
    throw new AppError(400, 'Logo must be 2 MB or smaller');
  }

  const ext =
    file.mimetype === 'image/png'
      ? '.png'
      : file.mimetype === 'image/webp'
        ? '.webp'
        : file.mimetype === 'image/gif'
          ? '.gif'
          : '.jpg';

  const uploadsDir = getUploadsDir();
  const filename = `logo-${Date.now()}${ext}`;
  const absolutePath = path.join(uploadsDir, filename);
  fs.writeFileSync(absolutePath, file.buffer);

  // Store relative path under prisma/data/uploads for portability
  const relativePath = path.join('uploads', filename);
  const updated = await updateBusinessSettings(
    { logoPath: relativePath },
    { identityEditActive: true },
  );
  return updated;
}
