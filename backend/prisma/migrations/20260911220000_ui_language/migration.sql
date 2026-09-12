-- AlterTable
-- SQLite: add uiLanguage column with ENGLISH default.
ALTER TABLE "BusinessSettings" ADD COLUMN "uiLanguage" TEXT NOT NULL DEFAULT 'ENGLISH';
