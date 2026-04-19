import { Module } from "@nestjs/common";

import { ReportsModule } from "../reports/reports.module";
import { AccountingShellController } from "./accounting-shell.controller";
import { AccountingShellService } from "./accounting-shell.service";

@Module({
  imports: [ReportsModule],
  controllers: [AccountingShellController],
  providers: [AccountingShellService]
})
export class AccountingShellModule {}
