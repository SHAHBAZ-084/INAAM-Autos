const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:./data/inaam-autos.db' } },
});

async function main() {
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 15000`);
  const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info("Product")`);
  const hasCustom = cols.some((c) => c.name === 'customFieldsJson');
  if (!hasCustom) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Product" ADD COLUMN "customFieldsJson" TEXT NOT NULL DEFAULT '{}'`,
    );
    console.log('Added Product.customFieldsJson');
  } else {
    console.log('Product.customFieldsJson already exists');
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProductCustomField" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "fieldType" TEXT NOT NULL DEFAULT 'TEXT',
      "optionsJson" TEXT NOT NULL DEFAULT '[]',
      "required" BOOLEAN NOT NULL DEFAULT false,
      "showOnBarcode" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ProductCustomField_key_key" ON "ProductCustomField"("key")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ProductCustomField_isActive_sortOrder_idx" ON "ProductCustomField"("isActive", "sortOrder")`,
  );
  console.log('ProductCustomField table ready');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
