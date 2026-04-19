import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { parseDateRangeQuery } from "../../common/utils/date-range";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { ChartsService } from "./charts.service";

@Controller("v1/charts")
@UseGuards(AuthenticatedGuard)
export class ChartsController {
  private readonly chartsService: ChartsService;

  constructor(@Inject(ChartsService) chartsService: ChartsService) {
    this.chartsService = chartsService;
  }

  @Get("dashboard")
  getDashboard(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    requirePermission(session, "shell.charts.read");
    return this.chartsService.getDashboard(
      session!.organization!.id,
      parseDateRangeQuery(from, to)
    );
  }
}
