import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";

@Module({
  imports: [AuditModule],
  controllers: [SetupController],
  providers: [SetupService],
  exports: [SetupService]
})
export class SetupModule {}
