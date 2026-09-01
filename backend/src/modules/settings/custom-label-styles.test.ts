import { describe, expect, it, beforeEach } from 'vitest';
import { AppError } from '../../utils/helpers';
import { prisma } from '../../lib/prisma';
import {
  createCustomLabelStyle,
  deleteCustomLabelStyle,
  updateCustomLabelStyle,
  validateLabelStyleFields,
} from './custom-label-styles.service';

function baseField(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    type: 'name',
    xMm: 0,
    yMm: 0,
    widthMm: 20,
    heightMm: 8,
    ...overrides,
  };
}

describe('validateLabelStyleFields', () => {
  it('accepts a valid field list', () => {
    const fields = validateLabelStyleFields(
      [baseField(), baseField({ id: 'f2', type: 'price', xMm: 0, yMm: 10, fontSizePt: 12 })],
      40,
      30,
    );
    expect(fields).toHaveLength(2);
    expect(fields[0]!.type).toBe('name');
  });

  it('rejects empty or oversized field arrays', () => {
    expect(() => validateLabelStyleFields([], 40, 30)).toThrow(AppError);
    expect(() =>
      validateLabelStyleFields(
        Array.from({ length: 21 }, (_, i) => baseField({ id: `f${i}` })),
        40,
        30,
      ),
    ).toThrow(/between 1 and 20/);
  });

  it('rejects fields outside canvas bounds', () => {
    expect(() =>
      validateLabelStyleFields([baseField({ xMm: 30, widthMm: 20 })], 40, 30),
    ).toThrow(/outside the canvas/);
    expect(() =>
      validateLabelStyleFields([baseField({ yMm: 25, heightMm: 10 })], 40, 30),
    ).toThrow(/outside the canvas/);
  });

  it('rejects bad font size and custom text without content', () => {
    expect(() =>
      validateLabelStyleFields([baseField({ fontSizePt: 5 })], 40, 30),
    ).toThrow(/font size/);
    expect(() =>
      validateLabelStyleFields([baseField({ type: 'customText', customText: '  ' })], 40, 30),
    ).toThrow(/non-empty text/);
  });

  it('accepts rotationDeg, fontFamily, and fontStyle', () => {
    const fields = validateLabelStyleFields(
      [
        baseField({
          rotationDeg: 90,
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSizePt: 11,
        }),
      ],
      40,
      30,
    );
    expect(fields[0]!.rotationDeg).toBe(90);
    expect(fields[0]!.fontFamily).toBe('Georgia');
    expect(fields[0]!.fontStyle).toBe('italic');
  });

  it('rejects invalid rotation and non-print-safe fonts', () => {
    expect(() =>
      validateLabelStyleFields([baseField({ rotationDeg: 400 })], 40, 30),
    ).toThrow(/rotation/i);
    expect(() =>
      validateLabelStyleFields([baseField({ fontFamily: 'Comic Sans' })], 40, 30),
    ).toThrow(/font/i);
    expect(() =>
      validateLabelStyleFields([baseField({ fontStyle: 'oblique' })], 40, 30),
    ).toThrow(/font style/i);
  });
});

describe('updateCustomLabelStyle', () => {
  beforeEach(async () => {
    await prisma.customLabelStyle.deleteMany({
      where: { name: { startsWith: 'UT-Style-' } },
    });
  });

  it('PATCHes an existing style in place', async () => {
    const created = await createCustomLabelStyle({
      name: 'UT-Style-Create',
      canvasWidthMm: 38,
      canvasHeightMm: 28,
      fields: [baseField({ id: 'shop', type: 'shop', fontSizePt: 10 })],
    });

    const updated = await updateCustomLabelStyle(created.id, {
      name: 'UT-Style-Updated',
      canvasWidthMm: 40,
      canvasHeightMm: 30,
      fields: [
        baseField({
          id: 'price',
          type: 'price',
          xMm: 2,
          yMm: 4,
          widthMm: 30,
          heightMm: 8,
          fontSizePt: 12,
          rotationDeg: 180,
          fontFamily: 'Verdana',
          fontStyle: 'italic',
        }),
      ],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.key).toBe(created.key);
    expect(updated.name).toBe('UT-Style-Updated');
    expect(updated.canvasWidthMm).toBe(40);
    expect(updated.fields[0]!.rotationDeg).toBe(180);
    expect(updated.fields[0]!.fontFamily).toBe('Verdana');
    expect(updated.fields[0]!.fontStyle).toBe('italic');

    await deleteCustomLabelStyle(created.id);
  });

  it('returns 404 for unknown id', async () => {
    await expect(
      updateCustomLabelStyle(999999, {
        name: 'UT-Style-Missing',
        canvasWidthMm: 38,
        canvasHeightMm: 28,
        fields: [baseField()],
      }),
    ).rejects.toThrow(/not found/i);
  });
});
