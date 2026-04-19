import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { PurchaseExtensionsController } from "./purchase-extensions.controller";
import { PurchaseExtensionsService } from "./purchase-extensions.service";

@Module({
  imports: [AuditModule, PurchasesModule],
  controllers: [PurchaseExtensionsController],
  providers: [PurchaseExtensionsService]
})
export class PurchaseExtensionsModule {}
