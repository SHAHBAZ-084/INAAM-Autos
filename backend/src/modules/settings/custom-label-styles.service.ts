import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

export type LabelStyleFieldType =
  | 'shop'
  | 'name'
  | 'size'
  | 'colour'
  | 'price'
  | 'barcode'
  | 'customText';

export type LabelStyleField = {
  id: string;
  type: LabelStyleFieldType;
  customText?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizePt?: number;
  fontWeight?: 'normal' | 'bold';
  align?: 'left' | 'center' | 'right';
  rotationDeg?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
};

export type CreateCustomLabelStyleInput = {
  name: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  fields: LabelStyleField[];
};

const FIELD_TYPES: ReadonlySet<string> = new Set([
  'shop',
  'name',
  'size',
  'colour',
  'price',
  'barcode',
  'customText',
]);

const PRINT_SAFE_FONTS: ReadonlySet<string> = new Set([
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
]);

function assertCanvasMm(value: number, field: string) {
  if (!Number.isInteger(value) || value < 10 || value > 200) {
    throw new AppError(400, `${field} must be an integer between 10 and 200 mm`);
  }
}

/** Validate freeform label style fields. Exported for unit tests. */
export function validateLabelStyleFields(
  fields: unknown,
  canvasWidthMm: number,
  canvasHeightMm: number,
): LabelStyleField[] {
  if (!Array.isArray(fields)) {
    throw new AppError(400, 'Fields must be an array');
  }
  if (fields.length < 1 || fields.length > 20) {
    throw new AppError(400, 'Fields must contain between 1 and 20 entries');
  }

  const seenIds = new Set<string>();
  const out: LabelStyleField[] = [];

  for (let i = 0; i < fields.length; i++) {
    const raw = fields[i];
    if (!raw || typeof raw !== 'object') {
      throw new AppError(400, `Field ${i + 1} is invalid`);
    }
    const f = raw as Record<string, unknown>;
    const id = typeof f.id === 'string' ? f.id.trim() : '';
    if (!id) {
      throw new AppError(400, `Field ${i + 1} needs an id`);
    }
    if (seenIds.has(id)) {
      throw new AppError(400, `Duplicate field id: ${id}`);
    }
    seenIds.add(id);

    const type = f.type;
    if (typeof type !== 'string' || !FIELD_TYPES.has(type)) {
      throw new AppError(400, `Field ${i + 1} has an invalid type`);
    }

    const xMm = Number(f.xMm);
    const yMm = Number(f.yMm);
    const widthMm = Number(f.widthMm);
    const heightMm = Number(f.heightMm);
    if (![xMm, yMm, widthMm, heightMm].every((n) => Number.isFinite(n))) {
      throw new AppError(400, `Field ${i + 1} has invalid position or size`);
    }
    if (widthMm <= 0 || heightMm <= 0) {
      throw new AppError(400, `Field ${i + 1} width and height must be positive`);
    }
    if (xMm < 0 || yMm < 0 || xMm + widthMm > canvasWidthMm + 0.001 || yMm + heightMm > canvasHeightMm + 0.001) {
      throw new AppError(400, `Field ${i + 1} is outside the canvas bounds`);
    }

    let customText: string | undefined;
    if (type === 'customText') {
      if (typeof f.customText !== 'string' || !f.customText.trim()) {
        throw new AppError(400, `Field ${i + 1} (custom text) needs non-empty text`);
      }
      customText = f.customText.trim().slice(0, 120);
    }

    let fontSizePt: number | undefined;
    if (f.fontSizePt !== undefined && f.fontSizePt !== null) {
      const pt = Number(f.fontSizePt);
      if (!Number.isFinite(pt) || pt < 6 || pt > 40) {
        throw new AppError(400, `Field ${i + 1} font size must be between 6 and 40 pt`);
      }
      fontSizePt = pt;
    }

    let fontWeight: 'normal' | 'bold' | undefined;
    if (f.fontWeight !== undefined && f.fontWeight !== null) {
      if (f.fontWeight !== 'normal' && f.fontWeight !== 'bold') {
        throw new AppError(400, `Field ${i + 1} font weight must be normal or bold`);
      }
      fontWeight = f.fontWeight;
    }

    let align: 'left' | 'center' | 'right' | undefined;
    if (f.align !== undefined && f.align !== null) {
      if (f.align !== 'left' && f.align !== 'center' && f.align !== 'right') {
        throw new AppError(400, `Field ${i + 1} align must be left, center, or right`);
      }
      align = f.align;
    }

    let rotationDeg: number | undefined;
    if (f.rotationDeg !== undefined && f.rotationDeg !== null) {
      const deg = Number(f.rotationDeg);
      if (!Number.isInteger(deg) || deg < 0 || deg > 359) {
        throw new AppError(400, `Field ${i + 1} rotation must be an integer between 0 and 359`);
      }
      rotationDeg = deg;
    }

    let fontFamily: string | undefined;
    if (f.fontFamily !== undefined && f.fontFamily !== null) {
      if (typeof f.fontFamily !== 'string' || !PRINT_SAFE_FONTS.has(f.fontFamily)) {
        throw new AppError(
          400,
          `Field ${i + 1} font must be one of: Arial, Helvetica, Times New Roman, Courier New, Georgia, Verdana`,
        );
      }
      fontFamily = f.fontFamily;
    }

    let fontStyle: 'normal' | 'italic' | undefined;
    if (f.fontStyle !== undefined && f.fontStyle !== null) {
      if (f.fontStyle !== 'normal' && f.fontStyle !== 'italic') {
        throw new AppError(400, `Field ${i + 1} font style must be normal or italic`);
      }
      fontStyle = f.fontStyle;
    }

    out.push({
      id,
      type: type as LabelStyleFieldType,
      ...(customText !== undefined ? { customText } : {}),
      xMm,
      yMm,
      widthMm,
      heightMm,
      ...(fontSizePt !== undefined ? { fontSizePt } : {}),
      ...(fontWeight !== undefined ? { fontWeight } : {}),
      ...(align !== undefined ? { align } : {}),
      ...(rotationDeg !== undefined ? { rotationDeg } : {}),
      ...(fontFamily !== undefined ? { fontFamily } : {}),
      ...(fontStyle !== undefined ? { fontStyle } : {}),
    });
  }

  return out;
}

function serializeStyle(row: {
  id: number;
  key: string;
  name: string;
  canvasWidthMm: number;
  canvasHeightMm: number;
  fields: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    canvasWidthMm: row.canvasWidthMm,
    canvasHeightMm: row.canvasHeightMm,
    fields: row.fields as LabelStyleField[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCustomLabelStyles() {
  const rows = await prisma.customLabelStyle.findMany({
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(serializeStyle);
}

export async function createCustomLabelStyle(input: CreateCustomLabelStyleInput) {
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new AppError(400, 'Style name must be 1–80 characters');
  }

  assertCanvasMm(input.canvasWidthMm, 'Canvas width');
  assertCanvasMm(input.canvasHeightMm, 'Canvas height');
  const fields = validateLabelStyleFields(input.fields, input.canvasWidthMm, input.canvasHeightMm);

  const key = `style-${Date.now()}`;

  const row = await prisma.customLabelStyle.create({
    data: {
      key,
      name,
      canvasWidthMm: input.canvasWidthMm,
      canvasHeightMm: input.canvasHeightMm,
      fields: fields as unknown as Prisma.InputJsonValue,
    },
  });
  return serializeStyle(row);
}

export async function updateCustomLabelStyle(id: number, input: CreateCustomLabelStyleInput) {
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new AppError(400, 'Style name must be 1–80 characters');
  }

  assertCanvasMm(input.canvasWidthMm, 'Canvas width');
  assertCanvasMm(input.canvasHeightMm, 'Canvas height');
  const fields = validateLabelStyleFields(input.fields, input.canvasWidthMm, input.canvasHeightMm);

  try {
    const row = await prisma.customLabelStyle.update({
      where: { id },
      data: {
        name,
        canvasWidthMm: input.canvasWidthMm,
        canvasHeightMm: input.canvasHeightMm,
        fields: fields as unknown as Prisma.InputJsonValue,
      },
    });
    return serializeStyle(row);
  } catch {
    throw new AppError(404, 'Custom label style not found');
  }
}

export async function deleteCustomLabelStyle(id: number) {
  try {
    const row = await prisma.customLabelStyle.delete({ where: { id } });
    return serializeStyle(row);
  } catch {
    throw new AppError(404, 'Custom label style not found');
  }
}
