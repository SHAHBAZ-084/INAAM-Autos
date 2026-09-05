import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './cp-list-seed';
import { createProduct, createProductCategory } from './products.service';

/**
 * Idempotent: when the shop has no active products, load the supplier CP List
 * catalog (categories + products, prices/stock at 0). Used by packaged first-run
 * so fresh .exe installs get the parts catalog without a manual seed script.
 */
export async function ensureCpListCatalog(): Promise<void> {
  const activeCount = await prisma.product.count({ where: { isActive: true } });
  if (activeCount > 0) return;

  logger.info('Seeding CP list catalog (no active products yet)', {
    categories: SEED_CATEGORIES.length,
    products: SEED_PRODUCTS.length,
  });

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

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of SEED_PRODUCTS) {
    let category = categoryByName.get(item.category.trim().toLowerCase());
    if (!category) {
      const createdCat = await createProductCategory(item.category.trim());
      category = createdCat;
      categoryByName.set(createdCat.name.toLowerCase(), createdCat);
    }

    const already = await prisma.product.findFirst({
      where: {
        name: item.name,
        categoryId: category.id,
        isActive: true,
      },
      select: { id: true },
    });
    if (already) {
      skipped += 1;
      continue;
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
    } catch (err) {
      failed += 1;
      logger.warn('CP list product seed failed', {
        name: item.name,
        category: item.category,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('CP list catalog seed finished', { created, skipped, failed });
}
