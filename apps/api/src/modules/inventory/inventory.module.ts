import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { FilesModule } from "../files/files.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
