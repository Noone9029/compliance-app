-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "costPrice" DECIMAL(18,2) NOT NULL,
    "salePrice" DECIMAL(18,2) NOT NULL,
    "quantityOnHand" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantityDelta" DECIMAL(18,2) NOT NULL,
    "quantityAfter" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_itemCode_key" ON "InventoryItem"("organizationId", "itemCode");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_itemName_idx" ON "InventoryItem"("organizationId", "itemName");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_createdAt_idx" ON "StockMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryItemId_createdAt_idx" ON "StockMovement"("inventoryItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
