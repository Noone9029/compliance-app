import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "./audit.service";

const auditReportQuerySchema = z.object({
  search: z.string().trim().optional(),
  result: z.enum(["SUCCESS", "FAILURE", "INFO"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

@Controller("v1/audit-report")
@UseGuards(AuthenticatedGuard)
export class AuditController {
  private readonly auditService: AuditService;

  constructor(@Inject(AuditService) auditService: AuditService) {
    this.auditService = auditService;
  }

  @Get()
  getAuditReport(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query() query: Record<string, unknown>
  ) {
    requirePermission(session, "platform.audit.read");
    const parsed = auditReportQuerySchema.parse(query);

    return this.auditService.getReport(session!.organization!.id, {
      search: parsed.search?.length ? parsed.search : undefined,
      result: parsed.result,
      limit: parsed.limit
    });
  }
}
