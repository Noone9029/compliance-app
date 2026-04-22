import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComplianceOnboardingClient } from "./compliance-onboarding.client";
import { ComplianceController } from "./compliance.controller";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import { ComplianceLocalValidationService } from "./compliance-local-validation.service";
import { ComplianceQueueService } from "./compliance-queue.service";
import { ComplianceService } from "./compliance.service";

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceQueueService,
    ComplianceCryptoService,
    ComplianceLocalValidationService,
    ComplianceOnboardingClient,
  ],
  exports: [ComplianceService]
})
export class ComplianceModule {}
