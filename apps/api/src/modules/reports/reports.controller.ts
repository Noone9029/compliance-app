import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { parseDateRangeQuery } from "../../common/utils/date-range";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { ReportsService } from "./reports.service";

@Controller("v1/reports")
@UseGuards(AuthenticatedGuard)
export class ReportsController {
  private readonly reportsService: ReportsService;

  constructor(@Inject(ReportsService) reportsService: ReportsService) {
    this.reportsService = reportsService;
  }

  @Get("dashboard")
  getDashboard(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    requirePermission(session, "shell.reports.read");
    return this.reportsService.getDashboard(
      session!.organization!.id,
      parseDateRangeQuery(from, to)
    );
  }
}
