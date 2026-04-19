import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

@Module({
  imports: [AuditModule],
  controllers: [QuotesController],
  providers: [QuotesService]
})
export class QuotesModule {}
