import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import { roleKeys } from "@daftar/types";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { MembershipsService } from "./memberships.service";

const createInvitationSchema = z.object({
  email: z.email(),
  fullName: z.string().min(1).optional().nullable(),
  roleKey: z.enum(roleKeys)
});

const updateRoleSchema = z.object({
  roleKey: z.enum(roleKeys)
});

@Controller("v1/memberships")
export class MembershipsController {
  private readonly membershipsService: MembershipsService;

  constructor(@Inject(MembershipsService) membershipsService: MembershipsService) {
    this.membershipsService = membershipsService;
  }

  @Get()
  @UseGuards(AuthenticatedGuard)
  async list(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    return this.membershipsService.listForUser(session!.user!.id);
  }

  @Get("team")
  @UseGuards(AuthenticatedGuard)
  async listTeam(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "platform.membership.read");
    return this.membershipsService.listTeamMembers(
      session!.organization!.id,
      session!.user!.id
    );
  }

  @Get("invitations")
  @UseGuards(AuthenticatedGuard)
  async listInvitations(
    @CurrentSession() session: AuthenticatedRequest["currentSession"]
  ) {
    requirePermission(session, "platform.membership.read");
    return this.membershipsService.listInvitations(session!.organization!.id);
  }

  @Post("invitations")
  @UseGuards(AuthenticatedGuard)
  async createInvitation(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    const parsed = createInvitationSchema.parse(body);
    return this.membershipsService.createInvitation(
      session!.organization!.id,
      session!.user!.id,
      parsed,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }

  @Post("invitations/:invitationId/resend")
  @UseGuards(AuthenticatedGuard)
  async resendInvitation(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invitationId") invitationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    return this.membershipsService.resendInvitation(
      session!.organization!.id,
      session!.user!.id,
      invitationId,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }

  @Post("invitations/:invitationId/revoke")
  @UseGuards(AuthenticatedGuard)
  async revokeInvitation(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invitationId") invitationId: string,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    return this.membershipsService.revokeInvitation(
      session!.organization!.id,
      session!.user!.id,
      invitationId,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }

  @Patch(":membershipId/role")
  @UseGuards(AuthenticatedGuard)
  async updateRole(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    const parsed = updateRoleSchema.parse(body);
    return this.membershipsService.updateRole(
      session!.organization!.id,
      session!.user!.id,
      membershipId,
      parsed,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }

  @Post(":membershipId/disable")
  @UseGuards(AuthenticatedGuard)
  async disableMembership(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("membershipId") membershipId: string,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    return this.membershipsService.disableMembership(
      session!.organization!.id,
      session!.user!.id,
      membershipId,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }

  @Post(":membershipId/restore")
  @UseGuards(AuthenticatedGuard)
  async restoreMembership(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("membershipId") membershipId: string,
    @Req() request: AuthenticatedRequest
  ) {
    requirePermission(session, "platform.membership.manage");
    return this.membershipsService.restoreMembership(
      session!.organization!.id,
      session!.user!.id,
      membershipId,
      {
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      }
    );
  }
}
