import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AccountingShellService } from "./accounting-shell.service";

const organisationStatsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional()
});

@Controller("v1/accounting")
@UseGuards(AuthenticatedGuard)
export class AccountingShellController {
  private readonly accountingShellService: AccountingShellService;

  constructor(
    @Inject(AccountingShellService) accountingShellService: AccountingShellService
  ) {
    this.accountingShellService = accountingShellService;
  }

  @Get("dashboard")
  getDashboard(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "shell.accounting.read");
    return this.accountingShellService.getDashboard(session!.organization!.id);
  }

  @Get("organisation-stats")
  getOrganisationStats(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query() query: unknown
  ) {
    requirePermission(session, "shell.accounting.read");
    const filters = organisationStatsQuerySchema.parse(query);

    return this.accountingShellService.getOrganisationStats(session!.organization!.id, filters);
  }
}
