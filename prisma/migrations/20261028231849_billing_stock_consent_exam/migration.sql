-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('SIMPLIFIED', 'FULL', 'RECTIFYING');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'ARRIVED';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BIZUM';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "consentText" TEXT,
ADD COLUMN     "examTemplate" JSONB,
ADD COLUMN     "seriesFull" TEXT NOT NULL DEFAULT 'F',
ADD COLUMN     "seriesRectifying" TEXT NOT NULL DEFAULT 'R',
ADD COLUMN     "seriesSimplified" TEXT NOT NULL DEFAULT 'T';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "salePrice" DOUBLE PRECISION,
ADD COLUMN     "taxRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "inventoryItemId" TEXT,
ADD COLUMN     "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 21;

-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "clinicalSigns" TEXT,
ADD COLUMN     "exam" JSONB,
ADD COLUMN     "homeCare" TEXT,
ADD COLUMN     "presumptiveDiagnosis" TEXT;

-- AlterTable
ALTER TABLE "Owner" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nif" TEXT,
ADD COLUMN     "remindersConsent" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "alerts" TEXT,
ADD COLUMN     "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,
    "receivedById" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "lot" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "lot" TEXT,
    "expiryDate" TIMESTAMP(3),
    "unitCost" DOUBLE PRECISION,
    "supplier" TEXT,
    "document" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "userId" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'rgpd',
    "text" TEXT NOT NULL,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT NOT NULL,
    "signatureKey" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ownerId" TEXT NOT NULL,
    "recordedById" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "InventoryBatch_itemId_idx" ON "InventoryBatch"("itemId");

-- CreateIndex
CREATE INDEX "InventoryBatch_expiryDate_idx" ON "InventoryBatch"("expiryDate");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_invoiceId_idx" ON "StockMovement"("invoiceId");

-- CreateIndex
CREATE INDEX "Consent_ownerId_idx" ON "Consent"("ownerId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "customerNif" TEXT,
    "customerAddress" TEXT,
    "lines" JSONB NOT NULL,
    "taxBreakdown" JSONB NOT NULL,
    "taxBase" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "invoiceId" TEXT NOT NULL,
    "replacesId" TEXT,
    "issuedById" TEXT,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalDocument_issuedAt_idx" ON "FiscalDocument"("issuedAt");

-- CreateIndex
CREATE INDEX "FiscalDocument_invoiceId_idx" ON "FiscalDocument"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_series_year_number_key" ON "FiscalDocument"("series", "year", "number");

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vaccination" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN     "details" JSONB,
ADD COLUMN     "petIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "signerName" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "adviserEmail" TEXT;

-- AlterTable
ALTER TABLE "FiscalDocument" ADD COLUMN     "exportId" TEXT;

-- CreateTable
CREATE TABLE "AdviserExport" (
    "id" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "sentTo" TEXT,
    "docCount" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AdviserExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdviserExport_createdAt_idx" ON "AdviserExport"("createdAt");

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "AdviserExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdviserExport" ADD CONSTRAINT "AdviserExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "presvetRef" TEXT,
ADD COLUMN     "presvetSentAt" TIMESTAMP(3),
ADD COLUMN     "presvetStatus" TEXT;

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "antibiotic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exceptional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nationalCode" TEXT,
ADD COLUMN     "packages" DOUBLE PRECISION,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "route" TEXT,
ADD COLUMN     "treatmentDays" INTEGER;

-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "petIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB,
    "signerName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT,
    "consentId" TEXT,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_token_key" ON "ConsentRequest"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_consentId_key" ON "ConsentRequest"("consentId");

-- CreateIndex
CREATE INDEX "ConsentRequest_ownerId_idx" ON "ConsentRequest"("ownerId");

-- CreateIndex
CREATE INDEX "Prescription_presvetStatus_idx" ON "Prescription"("presvetStatus");

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing paid invoices: one payment each, so cash reports and debts include them
UPDATE "Invoice" SET "paidAmount" = "totalAmount" WHERE "status" = 'PAID';
INSERT INTO "Payment" ("id", "amount", "method", "paidAt", "createdAt", "invoiceId")
SELECT 'mig_' || "id", "totalAmount", COALESCE("paymentMethod", 'CASH'), COALESCE("paidAt", "createdAt"), now(), "id"
FROM "Invoice" WHERE "status" = 'PAID';
