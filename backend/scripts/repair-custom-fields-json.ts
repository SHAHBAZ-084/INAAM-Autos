/**
 * Non-destructive repair: normalize Product.customFieldsJson values to strings.
 * Never deletes products or overwrites unrelated columns.
 *
 * Usage:
 *   npx tsx scripts/repair-custom-fields-json.ts
 *   INAAM_USER_DATA="C:/Users/.../AppData/Roaming/INAAM AUTOS" npx tsx scripts/repair-custom-fields-json.ts
 */
import { configureSqlite, disconnectPrisma, prisma } from '../src/lib/prisma';
import { describeDataLocation } from '../src/config/paths';
import {
  parseCustomFieldsJson,
  stringifyCustomFields,
} from '../src/modules/products/product-custom-fields.service';

async function main() {
  await configureSqlite();
  const loc = describeDataLocation();
  console.log('Repairing customFieldsJson in:', loc.databasePath, `(mode=${loc.mode})`);

  const rows = await prisma.product.findMany({
    select: { id: true, name: true, customFieldsJson: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const normalized = stringifyCustomFields(parseCustomFieldsJson(row.customFieldsJson));
    if (normalized === (row.customFieldsJson || '{}')) {
      skipped += 1;
      continue;
    }
    await prisma.product.update({
      where: { id: row.id },
      data: { customFieldsJson: normalized },
    });
    updated += 1;
    console.log(`Normalized product #${row.id} (${row.name})`);
  }

  console.log(`Done. Updated ${updated}, already clean ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
