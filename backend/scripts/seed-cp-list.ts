/**
 * Seed CP List products into the active app database.
 *
 * Dev DB (default):
 *   npx tsx scripts/seed-cp-list.ts
 *
 * Installed app DB:
 *   INAAM_USER_DATA="C:/Users/.../AppData/Roaming/INAAM AUTOS" npx tsx scripts/seed-cp-list.ts
 *
 * Prices and stock start at 0.
 */
import { configureSqlite, disconnectPrisma, prisma } from '../src/lib/prisma';
import { describeDataLocation } from '../src/config/paths';
import { createProduct, createProductCategory } from '../src/modules/products/products.service';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './seed-data/cp-list-seed';

async function main() {
  await configureSqlite();
  const loc = describeDataLocation();
  console.log('Seeding CP list into:', loc.databasePath, `(mode=${loc.mode})`);
  console.log(`Categories: ${SEED_CATEGORIES.length}, products: ${SEED_PRODUCTS.length}`);

  const categoryByName = new Map<string, { id: number; name: string }>();

  for (const name of SEED_CATEGORIES) {
    const existing = await prisma.productCategory.findFirst({
      where: { name },
    });
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
  console.log('Categories ready:', categoryByName.size);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, item] of SEED_PRODUCTS.entries()) {
    const catKey = item.category.trim().toLowerCase();
    let category = categoryByName.get(catKey);
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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed [${index + 1}/${SEED_PRODUCTS.length}] ${item.name} / ${item.category}: ${message}`);
    }

    if ((index + 1) % 50 === 0) {
      console.log(
        `Progress ${index + 1}/${SEED_PRODUCTS.length} (created=${created}, skipped=${skipped}, failed=${failed})`,
      );
    }
  }

  const activeProducts = await prisma.product.count({ where: { isActive: true } });
  const variants = await prisma.productVariant.count();
  const categories = await prisma.productCategory.count({ where: { isActive: true } });

  console.log('Done.', { created, skipped, failed, activeProducts, variants, categories });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
