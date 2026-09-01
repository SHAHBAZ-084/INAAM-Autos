-- CreateTable
CREATE TABLE "CustomLabelStyle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canvasWidthMm" INTEGER NOT NULL,
    "canvasHeightMm" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomLabelStyle_key_key" ON "CustomLabelStyle"("key");

-- CreateIndex
CREATE INDEX "CustomLabelStyle_createdAt_idx" ON "CustomLabelStyle"("createdAt");
