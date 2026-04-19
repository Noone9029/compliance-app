import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { SalesModule } from "../sales/sales.module";
import { SalesExtensionsController } from "./sales-extensions.controller";
import { SalesExtensionsService } from "./sales-extensions.service";

@Module({
  imports: [AuditModule, SalesModule],
  controllers: [SalesExtensionsController],
  providers: [SalesExtensionsService]
})
export class SalesExtensionsModule {}
