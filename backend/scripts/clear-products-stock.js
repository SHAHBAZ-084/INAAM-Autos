/**
 * Option C wipe: clear products/stock only.
 * Keeps sales, purchases, customers, suppliers, settings, users, accounts.
 *
 * Products still referenced by invoice/purchase line items cannot be deleted
 * (FK). Those are zeroed + deactivated so the catalog is empty for re-seed.
 *
 * Usage:
 *   DATABASE_URL="file:..." node scripts/clear-products-stock.js
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function referencedProductIds() {
  const [invoice, purchase, saleReturn, exchange, purchaseReturn] = await Promise.all([
    prisma.invoiceItem.findMany({ select: { productId: true }, distinct: ['productId'] }),
    prisma.purchaseItem.findMany({ select: { productId: true }, distinct: ['productId'] }),
    prisma.saleReturnItem.findMany({ select: { productId: true }, distinct: ['productId'] }),
    prisma.exchangeItem.findMany({ select: { productId: true }, distinct: ['productId'] }),
    prisma.purchaseReturnItem.findMany({ select: { productId: true }, distinct: ['productId'] }),
  ]);
  return new Set(
    [...invoice, ...purchase, ...saleReturn, ...exchange, ...purchaseReturn]
      .map((r) => r.productId)
      .filter(Boolean),
  );
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || '(default from prisma)';
  console.log('Clearing products/stock for:', dbUrl);

  const before = {
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    movements: await prisma.stockMovement.count(),
    categories: await prisma.productCategory.count(),
  };
  console.log('Before:', before);

  const keptIds = await referencedProductIds();
  console.log('Products kept (linked to sales/purchases):', keptIds.size);

  const result = await prisma.$transaction(async (tx) => {
    const movements = await tx.stockMovement.deleteMany({});

    // Zero stock everywhere
    await tx.productVariant.updateMany({
      data: { currentStock: 0, damagedStock: 0 },
    });
    await tx.product.updateMany({
      data: { currentStock: 0, damagedStock: 0 },
    });

    // Delete unreferenced products (variants cascade)
    let deletedProducts = { count: 0 };
    if (keptIds.size === 0) {
      deletedProducts = await tx.product.deleteMany({});
    } else {
      deletedProducts = await tx.product.deleteMany({
        where: { id: { notIn: [...keptIds] } },
      });
      // Soft-hide referenced leftovers so re-seed can add fresh SKUs
      await tx.product.updateMany({
        where: { id: { in: [...keptIds] } },
        data: { isActive: false, currentStock: 0, damagedStock: 0 },
      });
    }

    // Drop empty categories
    const categories = await tx.productCategory.deleteMany({
      where: { products: { none: {} } },
    });

    return { movements, deletedProducts, categories };
  });

  const after = {
    products: await prisma.product.count(),
    activeProducts: await prisma.product.count({ where: { isActive: true } }),
    variants: await prisma.productVariant.count(),
    movements: await prisma.stockMovement.count(),
    categories: await prisma.productCategory.count(),
  };

  console.log('Deleted stock movements:', result.movements.count);
  console.log('Deleted products:', result.deletedProducts.count);
  console.log('Deleted empty categories:', result.categories.count);
  console.log('After:', after);
  console.log('Done. Sales/settings untouched.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
