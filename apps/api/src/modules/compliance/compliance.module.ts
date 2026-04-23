import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComplianceOnboardingClient } from "./compliance-onboarding.client";
import { ComplianceController } from "./compliance.controller";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import { ComplianceEncryptionService } from "./encryption.service";
import { ComplianceLocalValidationService } from "./compliance-local-validation.service";
import { ComplianceQueueService } from "./compliance-queue.service";
import { ComplianceService } from "./compliance.service";
import { SdkParityService } from "./sdk-parity.service";

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceQueueService,
    ComplianceCryptoService,
    ComplianceEncryptionService,
    ComplianceLocalValidationService,
    ComplianceOnboardingClient,
    SdkParityService,
  ],
  exports: [ComplianceService]
})
export class ComplianceModule {}
