/** Shared barcode label size presets and print helpers (frontend-only layout). */

export type LabelSizePreset = {
  key: string;
  label: string;
  mode: 'thermal' | 'a4';
  widthMm: number;
  heightMm: number;
  /** Physical roll media width (mm) for printer gap/label sensing. */
  rollWidthMm?: number;
  /** Physical roll media height (mm) for printer gap/label sensing. */
  rollHeightMm?: number;
  /** Gap between stickers on the roll (mm). */
  rollGapMm?: number;
  /** Stickers side-by-side per physical row (default 1). */
  labelsAcross?: number;
  /** Horizontal gap between side-by-side stickers (mm). */
  acrossGapMm?: number;
};

/** Physical sticker roll default: 58 × 40 mm. */
export const STICKER_LABEL_WIDTH_MM = 58;
export const STICKER_LABEL_HEIGHT_MM = 40;
export const DEFAULT_BARCODE_LABEL_SIZE = '58x40';

/** Common thermal roll sizes + A4 sheet mode. */
export const BARCODE_LABEL_PRESETS: LabelSizePreset[] = [
  {
    key: '58x40',
    label: '58 × 40 mm (sticker roll)',
    mode: 'thermal',
    widthMm: 58,
    heightMm: 40,
    rollWidthMm: 58,
    rollHeightMm: 40,
    rollGapMm: 3,
  },
  {
    key: '33x23',
    label: '33 × 23 mm (short roll)',
    mode: 'thermal',
    widthMm: 33,
    heightMm: 23,
    rollWidthMm: 38,
    rollHeightMm: 28,
    rollGapMm: 2,
  },
  {
    key: '38x28-2up',
    label: '38 × 28 mm × 2 across (double lane roll)',
    mode: 'thermal',
    widthMm: 38,
    heightMm: 28,
    rollGapMm: 3,
    labelsAcross: 2,
    acrossGapMm: 2,
  },
  { key: '40x30', label: '40 × 30 mm (thermal)', mode: 'thermal', widthMm: 40, heightMm: 30 },
  { key: '50x25', label: '50 × 25 mm (thermal)', mode: 'thermal', widthMm: 50, heightMm: 25 },
  { key: '50x30', label: '50 × 30 mm (thermal)', mode: 'thermal', widthMm: 50, heightMm: 30 },
  { key: 'a4', label: 'A4 sheet (grid)', mode: 'a4', widthMm: 50, heightMm: 30 },
];

export type ParsedLabelSize = {
  key: string;
  mode: 'thermal' | 'a4';
  widthMm: number;
  heightMm: number;
  label: string;
  isCustom: boolean;
  rollWidthMm?: number;
  rollHeightMm?: number;
  rollGapMm?: number;
  labelsAcross?: number;
  acrossGapMm?: number;
};

export type PackedLabelRow<T> = Array<T | null>;

export type LabelPackingStats = {
  across: number;
  totalLabels: number;
  rows: number;
  physicalSlots: number;
  unusedSlots: number;
};

const CUSTOM_RE = /^(\d{2,3})x(\d{2,3})$/i;

export function parseLabelSize(raw: string | null | undefined): ParsedLabelSize {
  const key = (raw ?? DEFAULT_BARCODE_LABEL_SIZE).trim() || DEFAULT_BARCODE_LABEL_SIZE;
  const preset = BARCODE_LABEL_PRESETS.find((p) => p.key === key);
  if (preset) {
    return {
      key: preset.key,
      mode: preset.mode,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      label: preset.label,
      isCustom: false,
      rollWidthMm: preset.rollWidthMm,
      rollHeightMm: preset.rollHeightMm,
      rollGapMm: preset.rollGapMm,
      labelsAcross: preset.labelsAcross,
      acrossGapMm: preset.acrossGapMm,
    };
  }
  const match = CUSTOM_RE.exec(key);
  if (match) {
    const widthMm = Number(match[1]);
    const heightMm = Number(match[2]);
    return {
      key: `${widthMm}x${heightMm}`,
      mode: 'thermal',
      widthMm,
      heightMm,
      label: `${widthMm} × ${heightMm} mm (custom)`,
      isCustom: true,
    };
  }
  return parseLabelSize(DEFAULT_BARCODE_LABEL_SIZE);
}

export function isKnownLabelSizeKey(raw: string): boolean {
  const key = raw.trim();
  if (BARCODE_LABEL_PRESETS.some((p) => p.key === key)) return true;
  return CUSTOM_RE.test(key);
}

export function expandLabelCopies<T extends { key: string }>(
  items: T[],
  quantities: Record<string, number>,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.min(99, Math.floor(Number(quantities[item.key] ?? 1))));
    for (let i = 0; i < qty; i++) {
      out.push(i === 0 ? item : { ...item, key: `${item.key}-copy-${i}` });
    }
  }
  return out;
}

/**
 * Build one continuous logical print queue from the requested per-item quantities.
 * Quantity always means exact physical labels required; no across math happens here.
 */
export function buildLabelPrintQueue<T extends { key: string }>(
  items: T[],
  quantities: Record<string, number>,
): T[] {
  const out: T[] = [];
  const generatedCounts: Record<string, number> = {};

  for (const item of items) {
    const rawQty = Number(quantities[item.key] ?? 1);
    if (!Number.isFinite(rawQty) || !Number.isInteger(rawQty) || rawQty < 0) {
      throw new Error(`Invalid label quantity for ${item.key}`);
    }

    generatedCounts[item.key] = 0;
    for (let i = 0; i < rawQty; i++) {
      out.push(i === 0 ? item : { ...item, key: `${item.key}-copy-${i}` });
      generatedCounts[item.key] += 1;
    }

    if (generatedCounts[item.key] !== rawQty) {
      throw new Error(`Label queue mismatch for ${item.key}: requested ${rawQty}, generated ${generatedCounts[item.key]}`);
    }
  }

  return out;
}

/**
 * Sequentially pack a continuous label queue into physical rows.
 * Empty slots only appear at the unavoidable end of the final row.
 */
export function packLabelsAcross<T>(
  queue: T[],
  across: number,
): PackedLabelRow<T>[] {
  if (!Number.isFinite(across) || !Number.isInteger(across) || across < 1) {
    throw new Error(`Invalid across value: ${across}`);
  }

  if (queue.length === 0) return [];

  const rows: PackedLabelRow<T>[] = [];
  for (let i = 0; i < queue.length; i += across) {
    const row: PackedLabelRow<T> = [];
    for (let lane = 0; lane < across; lane++) {
      row.push(queue[i + lane] ?? null);
    }
    rows.push(row);
  }
  return rows;
}

export function summarizePackedLabels<T>(
  rows: PackedLabelRow<T>[],
  across: number,
): LabelPackingStats {
  const safeAcross = Math.max(1, across);
  const totalLabels = rows.reduce(
    (sum, row) => sum + row.reduce((rowSum, item) => rowSum + (item ? 1 : 0), 0),
    0,
  );
  const physicalSlots = rows.length * safeAcross;
  return {
    across: safeAcross,
    totalLabels,
    rows: rows.length,
    physicalSlots,
    unusedSlots: physicalSlots - totalLabels,
  };
}

/** A4 grid: how many label columns fit on a page with ~8mm margins and 2mm gaps. */
export function a4GridColumns(labelWidthMm: number): number {
  const usable = 210 - 16;
  const gap = 2;
  return Math.max(1, Math.floor((usable + gap) / (labelWidthMm + gap)));
}

export function a4GridRows(labelHeightMm: number): number {
  const usable = 297 - 16;
  const gap = 2;
  return Math.max(1, Math.floor((usable + gap) / (labelHeightMm + gap)));
}

/** Merge hardcoded presets with DB custom presets (custom appended). */
export function mergeLabelPresets(
  customPresets: Array<{
    key: string;
    label: string;
    widthMm: number;
    heightMm: number;
    rollWidthMm?: number | null;
    rollHeightMm?: number | null;
    rollGapMm?: number | null;
    labelsAcross?: number | null;
    acrossGapMm?: number | null;
  }>,
): LabelSizePreset[] {
  const custom = customPresets.map((p) => ({
    key: p.key,
    label: p.label,
    mode: 'thermal' as const,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    rollWidthMm: p.rollWidthMm ?? undefined,
    rollHeightMm: p.rollHeightMm ?? undefined,
    rollGapMm: p.rollGapMm ?? undefined,
    labelsAcross: p.labelsAcross ?? undefined,
    acrossGapMm: p.acrossGapMm ?? undefined,
  }));
  return [...BARCODE_LABEL_PRESETS, ...custom];
}

/** Total physical page width for thermal sticker rows (single or multi-lane). */
export function stickerPageWidthMm(widthMm: number, labelsAcross = 1, acrossGapMm = 0): number {
  const across = Math.max(1, labelsAcross);
  return across * widthMm + (across - 1) * acrossGapMm;
}

export function parsedSizeFromPreset(preset: LabelSizePreset): ParsedLabelSize {
  return {
    key: preset.key,
    mode: preset.mode,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    label: preset.label,
    isCustom: !BARCODE_LABEL_PRESETS.some((p) => p.key === preset.key),
    rollWidthMm: preset.rollWidthMm,
    rollHeightMm: preset.rollHeightMm,
    rollGapMm: preset.rollGapMm,
    labelsAcross: preset.labelsAcross,
    acrossGapMm: preset.acrossGapMm,
  };
}
