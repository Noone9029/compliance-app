import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService]
})
export class PurchasesModule {}
