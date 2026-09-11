-- AlterTable
ALTER TABLE "Product" ADD COLUMN "customFieldsJson" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ProductCustomField" (
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCustomField_key_key" ON "ProductCustomField"("key");

-- CreateIndex
CREATE INDEX "ProductCustomField_isActive_sortOrder_idx" ON "ProductCustomField"("isActive", "sortOrder");
