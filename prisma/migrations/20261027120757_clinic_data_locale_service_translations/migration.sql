-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "dataLocale" TEXT NOT NULL DEFAULT 'es';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "translations" JSONB;

