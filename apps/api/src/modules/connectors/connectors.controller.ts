import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { connectorProviders } from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { ConnectorsService } from "./connectors.service";

const providerSchema = z.enum(connectorProviders);

const connectQuerySchema = z.object({
  redirectUri: z.string().url()
});

const callbackBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().url()
});

const connectorSyncSchema = z.object({
  direction: z.enum(["IMPORT", "EXPORT"]).default("IMPORT"),
  scope: z.string().optional().nullable()
});

@Controller("v1/connectors")
@UseGuards(AuthenticatedGuard)
export class ConnectorsController {
  constructor(
    @Inject(ConnectorsService)
    private readonly connectorsService: ConnectorsService
  ) {}

  @Get("accounts")
  listAccounts(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "connectors.read");

    return this.connectorsService.listAccounts(session!.organization!.id);
  }

  @Get("providers/:provider/connect-url")
  async getConnectUrl(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("provider") providerParam: string,
    @Query() query: unknown
  ) {
    requirePermission(session, "connectors.write");

    const provider = providerSchema.parse(providerParam);
    const { redirectUri } = connectQuerySchema.parse(query);

    return this.connectorsService.getConnectUrl({
      organizationId: session!.organization!.id,
      userId: session!.user!.id,
      provider,
      redirectUri
    });
  }

  @Post("providers/:provider/callback")
  async completeConnection(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("provider") providerParam: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "connectors.write");

    const provider = providerSchema.parse(providerParam);
    const input = callbackBodySchema.parse(body);

    return this.connectorsService.completeConnection({
      organizationId: session!.organization!.id,
      userId: session!.user!.id,
      provider,
      ...input
    });
  }

  @Get("logs")
  listLogs(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("connectorAccountId") connectorAccountId: string | undefined
  ) {
    requirePermission(session, "connectors.read");

    return this.connectorsService.listLogs(
      session!.organization!.id,
      connectorAccountId?.trim() || undefined
    );
  }

  @Get("accounts/:connectorAccountId/export-preview")
  getExportPreview(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("connectorAccountId") connectorAccountId: string
  ) {
    requirePermission(session, "connectors.read");

    return this.connectorsService.getExportPreview(
      session!.organization!.id,
      connectorAccountId
    );
  }

  @Post("accounts/:connectorAccountId/sync")
  async runSync(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("connectorAccountId") connectorAccountId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "connectors.sync");

    const input = connectorSyncSchema.parse(body ?? {});

    return this.connectorsService.runSync(
      session!.organization!.id,
      connectorAccountId,
      input
    );
  }
}