import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { parseCustomFieldsJson } from './product-custom-fields.service';
import {
  createProduct,
  createProductCategory,
  listProducts,
} from './products.service';

const PREFIX = 'TEST-HELMET-MESSY-';

async function cleanup() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = products.map((p) => p.id);
  if (ids.length) {
    await prisma.stockMovement.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.productCategory.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

describe('listProducts messy Helmet category data', () => {
  beforeEach(async () => {
    await cleanup();
  });

  it('filters by categoryId and serializes malformed customFieldsJson safely', async () => {
    const helmet = await createProductCategory(`${PREFIX}Helmet`);
    const other = await createProductCategory(`${PREFIX}Other`);

    const withMessyJson = await createProduct({
      name: `${PREFIX}Numeric Fields`,
      categoryId: helmet.id,
      salePrice: 1500,
      openingStock: 2,
      customFields: { helmet_size: '58', finish: 'Matte' },
    });

    // Simulate legacy / hand-edited JSON with non-string values (non-destructive write)
    await prisma.product.update({
      where: { id: withMessyJson.id },
      data: {
        customFieldsJson: JSON.stringify({
          helmet_size: 58,
          finish: true,
          empty: null,
          nested: { a: 1 },
        }),
      },
    });

    await createProduct({
      name: `${PREFIX}Urdu ہیلمٹ`,
      categoryId: helmet.id,
      salePrice: 0,
      openingStock: 1,
      variants: [
        { size: 'S', colour: null, currentStock: 0, salePrice: null },
        { size: 'L', colour: 'Black', currentStock: 1, salePrice: 2200 },
      ],
    });

    await createProduct({
      name: `${PREFIX}Elsewhere`,
      categoryId: other.id,
      salePrice: 100,
      openingStock: 1,
    });

    // Raw parse helper must coerce
    expect(parseCustomFieldsJson('{"helmet_size":58,"finish":true}')).toEqual({
      helmet_size: '58',
      finish: 'true',
    });

    const listed = await listProducts({ categoryId: helmet.id, pageSize: 50 });
    expect(listed.items.every((p) => p.categoryId === helmet.id)).toBe(true);
    expect(listed.items.some((p) => p.name.includes('Elsewhere'))).toBe(false);
    expect(listed.total).toBe(2);

    const messy = listed.items.find((p) => p.id === withMessyJson.id);
    expect(messy).toBeDefined();
    expect(messy!.customFields).toEqual({
      helmet_size: '58',
      finish: 'true',
      nested: '[object Object]',
    });
    expect(typeof messy!.salePrice).toBe('number');
    expect(Number.isFinite(messy!.salePrice)).toBe(true);

    const withVariants = listed.items.find((p) => p.name.includes('Urdu'));
    expect(withVariants?.variants?.length).toBe(2);
    expect(withVariants?.variants?.every((v) => v.salePrice === null || typeof v.salePrice === 'number')).toBe(
      true,
    );
  });
});
