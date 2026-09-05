/**
 * Seed / repair CP List products into the active app database.
 *
 * Dev DB (default):
 *   npx tsx scripts/seed-cp-list.ts
 *
 * Installed app DB:
 *   INAAM_USER_DATA="C:/Users/.../AppData/Roaming/INAAM AUTOS" npx tsx scripts/seed-cp-list.ts
 *
 * Prices and stock start at 0. Safe to re-run — only missing products are added.
 */
import { configureSqlite, disconnectPrisma, prisma } from '../src/lib/prisma';
import { describeDataLocation } from '../src/config/paths';
import { ensureCpListCatalog } from '../src/modules/products/cp-list-catalog';
import { SEED_PRODUCTS } from '../src/modules/products/cp-list-seed';

async function main() {
  await configureSqlite();
  const loc = describeDataLocation();
  console.log('Seeding/repairing CP list into:', loc.databasePath, `(mode=${loc.mode})`);

  const before = await prisma.product.count({ where: { isActive: true } });
  await ensureCpListCatalog();
  const after = await prisma.product.count({ where: { isActive: true } });
  const variants = await prisma.productVariant.count();
  const categories = await prisma.productCategory.count({ where: { isActive: true } });
  const universal = await prisma.product.count({
    where: {
      isActive: true,
      category: { name: 'Universal / Generic Parts' },
    },
  });

  console.log('Done.', {
    expected: SEED_PRODUCTS.length,
    before,
    after,
    added: after - before,
    variants,
    categories,
    universal,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
