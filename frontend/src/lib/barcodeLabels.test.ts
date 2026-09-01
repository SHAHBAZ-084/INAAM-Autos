import { describe, expect, it } from 'vitest';
import {
  buildLabelPrintQueue,
  packLabelsAcross,
  summarizePackedLabels,
} from './barcodeLabels';

type Item = { key: string; name: string };

function countByPrefix(rows: Array<Array<Item | null>>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const item of row) {
      if (!item) continue;
      const prefix = item.key.split('-copy-')[0]!;
      counts[prefix] = (counts[prefix] ?? 0) + 1;
    }
  }
  return counts;
}

describe('barcode label smart packing', () => {
  const a = { key: 'A', name: 'A' };
  const b = { key: 'B', name: 'B' };
  const c = { key: 'C', name: 'C' };

  it('Across = 1, A = 5', () => {
    const queue = buildLabelPrintQueue([a], { A: 5 });
    const rows = packLabelsAcross(queue, 1);
    expect(queue).toHaveLength(5);
    expect(rows).toHaveLength(5);
    expect(summarizePackedLabels(rows, 1)).toEqual({
      across: 1,
      totalLabels: 5,
      rows: 5,
      physicalSlots: 5,
      unusedSlots: 0,
    });
  });

  it('Across = 2, A = 2', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a], { A: 2 }), 2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([expect.objectContaining({ name: 'A' }), expect.objectContaining({ name: 'A' })]);
    expect(summarizePackedLabels(rows, 2).unusedSlots).toBe(0);
  });

  it('Across = 2, A = 6', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a], { A: 6 }), 2);
    expect(rows).toHaveLength(3);
    expect(countByPrefix(rows)).toEqual({ A: 6 });
    expect(summarizePackedLabels(rows, 2).unusedSlots).toBe(0);
  });

  it('Across = 2, A = 7', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a], { A: 7 }), 2);
    const stats = summarizePackedLabels(rows, 2);
    expect(countByPrefix(rows)).toEqual({ A: 7 });
    expect(stats.rows).toBe(4);
    expect(stats.unusedSlots).toBe(1);
    expect(rows.at(-1)).toEqual([expect.objectContaining({ name: 'A' }), null]);
  });

  it('Across = 2, A = 7, B = 5', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a, b], { A: 7, B: 5 }), 2);
    const stats = summarizePackedLabels(rows, 2);
    expect(countByPrefix(rows)).toEqual({ A: 7, B: 5 });
    expect(stats.totalLabels).toBe(12);
    expect(stats.rows).toBe(6);
    expect(stats.unusedSlots).toBe(0);
    expect(rows[3]).toEqual([expect.objectContaining({ name: 'A' }), expect.objectContaining({ name: 'B' })]);
  });

  it('Across = 3, A = 7, B = 5', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a, b], { A: 7, B: 5 }), 3);
    const stats = summarizePackedLabels(rows, 3);
    expect(countByPrefix(rows)).toEqual({ A: 7, B: 5 });
    expect(stats.totalLabels).toBe(12);
    expect(stats.rows).toBe(4);
    expect(stats.unusedSlots).toBe(0);
  });

  it('Across = 4, A = 7, B = 5', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a, b], { A: 7, B: 5 }), 4);
    const stats = summarizePackedLabels(rows, 4);
    expect(countByPrefix(rows)).toEqual({ A: 7, B: 5 });
    expect(stats.totalLabels).toBe(12);
    expect(stats.rows).toBe(3);
    expect(stats.unusedSlots).toBe(0);
  });

  it('Across = 2, A = 7, B = 5, C = 3', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a, b, c], { A: 7, B: 5, C: 3 }), 2);
    const stats = summarizePackedLabels(rows, 2);
    expect(countByPrefix(rows)).toEqual({ A: 7, B: 5, C: 3 });
    expect(stats.totalLabels).toBe(15);
    expect(stats.rows).toBe(8);
    expect(stats.unusedSlots).toBe(1);
  });

  it('allows zero quantity by skipping that item', () => {
    const rows = packLabelsAcross(buildLabelPrintQueue([a, b], { A: 0, B: 2 }), 2);
    expect(countByPrefix(rows)).toEqual({ B: 2 });
  });

  it('rejects negative quantities', () => {
    expect(() => buildLabelPrintQueue([a], { A: -1 })).toThrow(/Invalid label quantity/);
  });

  it('rejects decimal quantities', () => {
    expect(() => buildLabelPrintQueue([a], { A: 2.5 })).toThrow(/Invalid label quantity/);
  });

  it('rejects invalid across values', () => {
    expect(() => packLabelsAcross([a], 0)).toThrow(/Invalid across value/);
    expect(() => packLabelsAcross([a], 2.2)).toThrow(/Invalid across value/);
  });
});
import {
  a4GridColumns,
  a4GridRows,
  BARCODE_LABEL_PRESETS,
  expandLabelCopies,
  mergeLabelPresets,
  parseLabelSize,
  stickerPageWidthMm,
} from './barcodeLabels';

describe('barcodeLabels helpers', () => {
  it('parses thermal presets and a4', () => {
    expect(parseLabelSize('58x40').mode).toBe('thermal');
    expect(parseLabelSize('58x40').widthMm).toBe(58);
    expect(parseLabelSize('58x40').heightMm).toBe(40);
    expect(parseLabelSize('58x40').labelsAcross).toBeUndefined();
    expect(parseLabelSize('40x30').mode).toBe('thermal');
    expect(parseLabelSize('40x30').widthMm).toBe(40);
    expect(parseLabelSize('a4').mode).toBe('a4');
    expect(parseLabelSize('60x40').isCustom).toBe(true);
    expect(parseLabelSize('60x40').widthMm).toBe(60);
  });

  it('parses 38x28-2up double-lane preset', () => {
    const parsed = parseLabelSize('38x28-2up');
    expect(parsed.widthMm).toBe(38);
    expect(parsed.heightMm).toBe(28);
    expect(parsed.labelsAcross).toBe(2);
    expect(parsed.acrossGapMm).toBe(2);
    expect(stickerPageWidthMm(parsed.widthMm, parsed.labelsAcross, parsed.acrossGapMm)).toBe(78);
  });

  it('mergeLabelPresets includes labelsAcross from custom presets', () => {
    const merged = mergeLabelPresets([
      {
        key: '40x30-123',
        label: '40 × 30 mm (Test roll)',
        widthMm: 40,
        heightMm: 30,
        labelsAcross: 3,
        acrossGapMm: 1,
      },
    ]);
    const custom = merged.find((p) => p.key === '40x30-123');
    expect(custom?.labelsAcross).toBe(3);
    expect(custom?.acrossGapMm).toBe(1);
    expect(BARCODE_LABEL_PRESETS.some((p) => p.key === '38x28-2up')).toBe(true);
  });

  it('expands print quantities', () => {
    const items = [
      { key: 'a', name: 'One' },
      { key: 'b', name: 'Two' },
    ];
    expect(expandLabelCopies(items, { a: 3, b: 1 })).toHaveLength(4);
    expect(expandLabelCopies(items, { a: 0, b: 2 })).toHaveLength(2);
    expect(expandLabelCopies(items, { a: 0, b: 0 })).toHaveLength(0);
  });

  it('computes A4 grid that fits the page', () => {
    expect(a4GridColumns(50)).toBeGreaterThanOrEqual(3);
    expect(a4GridRows(30)).toBeGreaterThanOrEqual(8);
  });
});
