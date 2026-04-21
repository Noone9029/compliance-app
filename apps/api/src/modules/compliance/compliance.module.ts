import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import { ComplianceQueueService } from "./compliance-queue.service";
import { ComplianceService } from "./compliance.service";

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceQueueService, ComplianceCryptoService],
  exports: [ComplianceService]
})
export class ComplianceModule {}
