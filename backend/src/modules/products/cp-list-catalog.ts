import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './cp-list-seed';
import { createProduct, createProductCategory } from './products.service';

/**
 * Idempotent + resumable CP catalog seed.
 *
 * Never bails just because some products already exist — a partial first-run
 * (e.g. Electron health timeout mid-seed) must still fill the rest, including
 * Universal / Generic Parts at the end of the list.
 */
export async function ensureCpListCatalog(): Promise<void> {
  const categoryByName = new Map<string, { id: number; name: string }>();

  for (const name of SEED_CATEGORIES) {
    const existing = await prisma.productCategory.findFirst({ where: { name } });
    if (existing) {
      if (!existing.isActive) {
        await prisma.productCategory.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      categoryByName.set(name.toLowerCase(), existing);
      continue;
    }
    const created = await createProductCategory(name);
    categoryByName.set(created.name.toLowerCase(), created);
  }

  const existingRows = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      name: true,
      category: { select: { name: true } },
    },
  });
  const existingKeys = new Set(
    existingRows.map((row) => `${row.name}\0${row.category?.name ?? ''}`.toLowerCase()),
  );

  const missing = SEED_PRODUCTS.filter((item) => {
    const key = `${item.name}\0${item.category}`.toLowerCase();
    return !existingKeys.has(key);
  });

  if (missing.length === 0) {
    logger.info('CP list catalog already complete', {
      activeProducts: existingRows.length,
      expected: SEED_PRODUCTS.length,
    });
    return;
  }

  logger.info('Seeding CP list catalog (resuming missing products)', {
    categories: SEED_CATEGORIES.length,
    expected: SEED_PRODUCTS.length,
    alreadyPresent: existingRows.length,
    missing: missing.length,
  });

  let created = 0;
  let failed = 0;

  for (const item of missing) {
    let category = categoryByName.get(item.category.trim().toLowerCase());
    if (!category) {
      const createdCat = await createProductCategory(item.category.trim());
      category = createdCat;
      categoryByName.set(createdCat.name.toLowerCase(), createdCat);
    }

    try {
      await createProduct({
        name: item.name,
        categoryId: category.id,
        purchasePrice: 0,
        salePrice: 0,
        openingStock: 0,
        variants: item.variants?.map((v) => ({ size: v.size, currentStock: 0 })),
      });
      created += 1;
      existingKeys.add(`${item.name}\0${item.category}`.toLowerCase());
    } catch (err) {
      failed += 1;
      logger.warn('CP list product seed failed', {
        name: item.name,
        category: item.category,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('CP list catalog seed finished', {
    created,
    failed,
    stillMissing: missing.length - created,
  });
}
