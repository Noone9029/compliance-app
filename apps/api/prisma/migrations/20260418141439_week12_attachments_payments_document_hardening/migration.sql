-- AlterTable
ALTER TABLE "BillPayment" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "bankAccountId" TEXT;

-- CreateIndex
CREATE INDEX "BillPayment_bankAccountId_paymentDate_idx" ON "BillPayment"("bankAccountId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoicePayment_bankAccountId_paymentDate_idx" ON "InvoicePayment"("bankAccountId", "paymentDate");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
