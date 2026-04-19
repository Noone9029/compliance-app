import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { OrganizationsService } from "./organizations.service";

const switchSchema = z.object({
  orgSlug: z.string().min(1)
});

@Controller("v1/organizations")
export class OrganizationsController {
  private readonly organizationsService: OrganizationsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(OrganizationsService) organizationsService: OrganizationsService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.organizationsService = organizationsService;
    this.auditService = auditService;
  }

  @Get()
  @UseGuards(AuthenticatedGuard)
  list(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    return this.organizationsService.listForUser(session!.user!.id);
  }

  @Get("current")
  @UseGuards(AuthenticatedGuard)
  current(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    return session?.organization ?? null;
  }

  @Post("switch")
  @UseGuards(AuthenticatedGuard)
  async switch(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    const parsed = switchSchema.parse(body);
    const organization = await this.organizationsService.switchForUser({
      userId: session!.user!.id,
      currentSessionId: session!.id,
      orgSlug: parsed.orgSlug
    });

    await this.auditService.log({
      organizationId: organization.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "platform.org.switch",
      targetType: "organization",
      targetId: organization.id,
      result: "SUCCESS"
    });

    return organization;
  }
}
