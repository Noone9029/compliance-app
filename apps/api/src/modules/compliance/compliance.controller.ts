import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { ComplianceService } from "./compliance.service";

const integrationSchema = z.object({
  environment: z.enum(["Production", "Sandbox"]),
  mappings: z.array(
    z.object({
      bankAccountId: z.string().min(1),
      paymentMeansCode: z.string().min(1).nullable(),
    }),
  ),
});

@Controller("v1/compliance")
@UseGuards(AuthenticatedGuard)
export class ComplianceController {
  constructor(
    @Inject(ComplianceService)
    private readonly complianceService: ComplianceService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get("overview")
  getOverview(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "compliance.read");
    return this.complianceService.getOverview(session!.organization!.id);
  }

  @Get("reported-documents")
  listReportedDocuments(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
  ) {
    requirePermission(session, "compliance.read");
    return this.complianceService.listReportedDocuments(session!.organization!.id);
  }

  @Get("integration")
  getIntegration(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "compliance.read");
    return this.complianceService.getIntegration(session!.organization!.id);
  }

  @Put("integration")
  async updateIntegration(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
  ) {
    requirePermission(session, "compliance.write");
    const parsed = integrationSchema.parse(body);
    const integration = await this.complianceService.updateIntegration(
      session!.organization!.id,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.integration.update",
      targetType: "organization_setting",
      targetId: session!.organization!.id,
      result: "SUCCESS",
    });
    return integration;
  }

  @Post("integration/onboard")
  async onboard(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "compliance.write");
    const integration = await this.complianceService.onboard(session!.organization!.id);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.integration.onboard",
      targetType: "compliance_onboarding",
      targetId: session!.organization!.id,
      result: "SUCCESS",
    });
    return integration;
  }

  @Post("integration/renew")
  async renew(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "compliance.write");
    const integration = await this.complianceService.renewIntegration(
      session!.organization!.id,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.integration.renew",
      targetType: "compliance_onboarding",
      targetId: session!.organization!.id,
      result: "SUCCESS",
    });
    return integration;
  }

  @Post("integration/remove")
  async remove(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "compliance.write");
    const integration = await this.complianceService.removeIntegration(
      session!.organization!.id,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.integration.remove",
      targetType: "compliance_onboarding",
      targetId: session!.organization!.id,
      result: "SUCCESS",
    });
    return integration;
  }

  @Post("invoices/:invoiceId/report")
  async reportInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
  ) {
    requirePermission(session, "compliance.report");
    const document = await this.complianceService.reportInvoice(
      session!.organization!.id,
      session!.user!.id,
      invoiceId,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.invoice.report",
      targetType: "sales_invoice",
      targetId: invoiceId,
      result: "SUCCESS",
    });
    return document;
  }

  @Post("invoices/:invoiceId/retry")
  async retryInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
  ) {
    requirePermission(session, "compliance.report");
    const document = await this.complianceService.retryInvoiceSubmission(
      session!.organization!.id,
      session!.user!.id,
      invoiceId,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "compliance.invoice.retry",
      targetType: "sales_invoice",
      targetId: invoiceId,
      result: "SUCCESS",
    });
    return document;
  }

  @Get("invoices/:invoiceId/xml")
  async downloadInvoiceXml(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
    @Res() response: Response,
  ) {
    requirePermission(session, "compliance.read");
    const xml = await this.complianceService.getInvoiceXml(
      session!.organization!.id,
      invoiceId,
    );
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${xml.fileName}"`,
    );
    response.send(xml.xmlContent);
  }
}
