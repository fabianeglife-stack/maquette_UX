-- AlterTable
ALTER TABLE "Order" ADD COLUMN "materialOrderedAt" TEXT;
ALTER TABLE "Order" ADD COLUMN "materialReceivedAt" TEXT;
ALTER TABLE "Order" ADD COLUMN "palletizedAt" TEXT;
ALTER TABLE "Order" ADD COLUMN "treatmentOrderedAt" TEXT;
ALTER TABLE "Order" ADD COLUMN "treatmentReceivedAt" TEXT;
ALTER TABLE "Order" ADD COLUMN "treatmentSentAt" TEXT;
