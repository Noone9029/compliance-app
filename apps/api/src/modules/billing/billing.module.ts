import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BillingController } from "./billing.controller";
import { BillingWebhookController } from "./billing-webhook.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuditModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService]
})
export class BillingModule {}
