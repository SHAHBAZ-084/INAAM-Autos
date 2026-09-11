import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

export const PRODUCT_CUSTOM_FIELD_TYPES = ['TEXT', 'NUMBER', 'SELECT'] as const;
export type ProductCustomFieldType = (typeof PRODUCT_CUSTOM_FIELD_TYPES)[number];

export type ProductCustomFieldDto = {
  id: number;
  key: string;
  label: string;
  fieldType: ProductCustomFieldType;
  options: string[];
  required: boolean;
  showOnBarcode: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductCustomFieldInput = {
  label: string;
  fieldType?: ProductCustomFieldType;
  options?: string[];
  required?: boolean;
  showOnBarcode?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

function slugifyKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || `field_${Date.now()}`;
}

function parseOptions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function normalizeFieldType(raw: unknown): ProductCustomFieldType {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : 'TEXT';
  return (PRODUCT_CUSTOM_FIELD_TYPES as readonly string[]).includes(value)
    ? (value as ProductCustomFieldType)
    : 'TEXT';
}

function serializeField(row: {
  id: number;
  key: string;
  label: string;
  fieldType: string;
  optionsJson: string;
  required: boolean;
  showOnBarcode: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ProductCustomFieldDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fieldType: normalizeFieldType(row.fieldType),
    options: parseOptions(row.optionsJson),
    required: row.required,
    showOnBarcode: row.showOnBarcode,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseCustomFieldsJson(raw: unknown): Record<string, string> {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    out[key.trim()] = text.slice(0, 200);
  }
  return out;
}

export function stringifyCustomFields(values: Record<string, string> | undefined | null): string {
  return JSON.stringify(parseCustomFieldsJson(values ?? {}));
}

export async function listProductCustomFields(options?: { includeInactive?: boolean }) {
  const rows = await prisma.productCustomField.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(serializeField);
}

export async function createProductCustomField(input: ProductCustomFieldInput) {
  const label = input.label.trim();
  if (!label) throw new AppError(400, 'Field label is required');

  const fieldType = normalizeFieldType(input.fieldType);
  const options =
    fieldType === 'SELECT'
      ? (input.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 50)
      : [];
  if (fieldType === 'SELECT' && options.length === 0) {
    throw new AppError(400, 'SELECT fields need at least one option');
  }

  let key = slugifyKey(label);
  const existingKeys = new Set(
    (await prisma.productCustomField.findMany({ select: { key: true } })).map((r) => r.key),
  );
  if (existingKeys.has(key)) {
    let n = 2;
    while (existingKeys.has(`${key}_${n}`)) n += 1;
    key = `${key}_${n}`;
  }

  const maxSort = await prisma.productCustomField.aggregate({ _max: { sortOrder: true } });
  const sortOrder = input.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1;

  const row = await prisma.productCustomField.create({
    data: {
      key,
      label,
      fieldType,
      optionsJson: JSON.stringify(options),
      required: Boolean(input.required),
      showOnBarcode: Boolean(input.showOnBarcode),
      sortOrder,
      isActive: input.isActive !== false,
    },
  });
  return serializeField(row);
}

export async function updateProductCustomField(id: number, input: ProductCustomFieldInput) {
  const existing = await prisma.productCustomField.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Custom field not found');

  const label = input.label.trim();
  if (!label) throw new AppError(400, 'Field label is required');

  const fieldType = normalizeFieldType(input.fieldType ?? existing.fieldType);
  const options =
    fieldType === 'SELECT'
      ? (input.options ?? parseOptions(existing.optionsJson))
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];
  if (fieldType === 'SELECT' && options.length === 0) {
    throw new AppError(400, 'SELECT fields need at least one option');
  }

  const row = await prisma.productCustomField.update({
    where: { id },
    data: {
      label,
      fieldType,
      optionsJson: JSON.stringify(options),
      required: input.required !== undefined ? Boolean(input.required) : existing.required,
      showOnBarcode:
        input.showOnBarcode !== undefined ? Boolean(input.showOnBarcode) : existing.showOnBarcode,
      sortOrder: input.sortOrder !== undefined ? Math.floor(input.sortOrder) : existing.sortOrder,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
    },
  });
  return serializeField(row);
}

export async function deleteProductCustomField(id: number) {
  const existing = await prisma.productCustomField.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Custom field not found');
  const row = await prisma.productCustomField.update({
    where: { id },
    data: { isActive: false },
  });
  return serializeField(row);
}

export async function validateAndNormalizeCustomFieldValues(
  values: Record<string, string> | undefined | null,
): Promise<Record<string, string>> {
  const defs = await listProductCustomFields();
  const incoming = parseCustomFieldsJson(values ?? {});
  const out: Record<string, string> = {};

  for (const def of defs) {
    const raw = incoming[def.key] ?? '';
    const value = raw.trim();
    if (def.required && !value) {
      throw new AppError(400, `${def.label} is required`);
    }
    if (!value) continue;
    if (def.fieldType === 'NUMBER' && Number.isNaN(Number(value))) {
      throw new AppError(400, `${def.label} must be a number`);
    }
    if (def.fieldType === 'SELECT' && def.options.length > 0 && !def.options.includes(value)) {
      throw new AppError(400, `${def.label} must be one of: ${def.options.join(', ')}`);
    }
    out[def.key] = value.slice(0, 200);
  }

  return out;
}

export function barcodeLinesFromCustomFields(
  defs: ProductCustomFieldDto[],
  values: Record<string, string>,
): string[] {
  return defs
    .filter((def) => def.showOnBarcode && def.isActive)
    .map((def) => {
      const value = values[def.key]?.trim();
      if (!value) return '';
      return `${def.label}: ${value}`;
    })
    .filter(Boolean);
}
