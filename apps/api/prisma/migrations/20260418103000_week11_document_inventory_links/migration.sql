ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'IMPORT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE_BILL';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'SALES_INVOICE';

ALTER TABLE "SalesInvoiceLine"
ADD COLUMN "inventoryItemId" TEXT;

ALTER TABLE "PurchaseBillLine"
ADD COLUMN "inventoryItemId" TEXT;

ALTER TABLE "QuoteLine"
ADD COLUMN "inventoryItemId" TEXT;

CREATE INDEX "SalesInvoiceLine_inventoryItemId_idx" ON "SalesInvoiceLine"("inventoryItemId");
CREATE INDEX "PurchaseBillLine_inventoryItemId_idx" ON "PurchaseBillLine"("inventoryItemId");
CREATE INDEX "QuoteLine_inventoryItemId_idx" ON "QuoteLine"("inventoryItemId");

ALTER TABLE "SalesInvoiceLine"
ADD CONSTRAINT "SalesInvoiceLine_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "PurchaseBillLine"
ADD CONSTRAINT "PurchaseBillLine_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "QuoteLine"
ADD CONSTRAINT "QuoteLine_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
