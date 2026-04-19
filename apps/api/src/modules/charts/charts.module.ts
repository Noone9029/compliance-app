import { Module } from "@nestjs/common";

import { ReportsModule } from "../reports/reports.module";
import { ChartsController } from "./charts.controller";
import { ChartsService } from "./charts.service";

@Module({
  imports: [ReportsModule],
  controllers: [ChartsController],
  providers: [ChartsService]
})
export class ChartsModule {}
