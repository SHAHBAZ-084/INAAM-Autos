import { prisma } from './prisma';
import { logger } from './logger';

type ColumnRow = { name: string };

async function tableColumns(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<ColumnRow[]>(`PRAGMA table_info("${table}")`);
  return new Set(rows.map((r) => r.name));
}

async function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = await tableColumns(table);
  if (cols.has(column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  logger.info('Added missing schema column', { table, column });
}

/**
 * Guarantees critical columns exist even when `prisma migrate deploy`
 * did not run (common in local/dev) or was blocked by a DB lock.
 */
export async function ensureRequiredSchemaColumns(): Promise<void> {
  await addColumnIfMissing(
    'BusinessSettings',
    'developerCreditLine',
    `"developerCreditLine" TEXT NOT NULL DEFAULT 'AS Solutions | Ali & Shahbaz | 0322-0726006'`,
  );
  await addColumnIfMissing(
    'BusinessSettings',
    'primaryColor',
    `"primaryColor" TEXT NOT NULL DEFAULT '#111111'`,
  );
  await addColumnIfMissing(
    'BusinessSettings',
    'secondaryColor',
    `"secondaryColor" TEXT NOT NULL DEFAULT '#C99618'`,
  );
  // Safety net for upgrades where migrate has not yet added releaseMarker.
  await addColumnIfMissing('BusinessSettings', 'releaseMarker', `"releaseMarker" TEXT`);
  await addColumnIfMissing('Product', 'needsVariants', `"needsVariants" BOOLEAN NOT NULL DEFAULT 0`);
  await addColumnIfMissing('Product', 'customFieldsJson', `"customFieldsJson" TEXT NOT NULL DEFAULT '{}'`);
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
  await addColumnIfMissing('Invoice', 'amountReceived', `"amountReceived" DECIMAL NOT NULL DEFAULT 0`);
  await addColumnIfMissing('User', 'role', `"role" TEXT DEFAULT 'Owner'`);
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET role = 'Owner' WHERE role IS NULL OR TRIM(role) = ''`,
  );
  // Backfill amountReceived from paidAmount for older invoices.
  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice" SET "amountReceived" = "paidAmount" WHERE "amountReceived" = 0 AND "paidAmount" > 0`,
  );
}
