import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { fixedAssetStatuses } from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { AssetsService } from "./assets.service";

const assetSchema = z.object({
  assetNumber: z.string().optional().nullable(),
  name: z.string().min(1),
  category: z.string().min(1),
  purchaseDate: z.string().min(1),
  cost: z.string().min(1),
  salvageValue: z.string().min(1),
  usefulLifeMonths: z.number().int().positive(),
  depreciationMethod: z.string().min(1)
});

const assetPatchSchema = assetSchema
  .omit({ assetNumber: true })
  .extend({
    status: z.enum(fixedAssetStatuses).optional()
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const depreciationSchema = z.object({
  runDate: z.string().min(1)
});

@Controller("v1/assets")
@UseGuards(AuthenticatedGuard)
export class AssetsController {
  private readonly assetsService: AssetsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(AssetsService) assetsService: AssetsService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.assetsService = assetsService;
    this.auditService = auditService;
  }

  @Get()
  listAssets(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "assets.read");
    return this.assetsService.listAssets(session!.organization!.id);
  }

  @Post()
  async createAsset(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "assets.write");
    const parsed = assetSchema.parse(body);
    const asset = await this.assetsService.createAsset(session!.organization!.id, parsed);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "assets.asset.create",
      targetType: "fixed_asset",
      targetId: asset.id,
      result: "SUCCESS"
    });
    return asset;
  }

  @Get("depreciation-runs")
  listDepreciationRuns(
    @CurrentSession() session: AuthenticatedRequest["currentSession"]
  ) {
    requirePermission(session, "assets.read");
    return this.assetsService.listDepreciationRuns(session!.organization!.id);
  }

  @Get(":assetId")
  getAsset(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("assetId") assetId: string
  ) {
    requirePermission(session, "assets.read");
    return this.assetsService.getAsset(session!.organization!.id, assetId);
  }

  @Patch(":assetId")
  async updateAsset(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("assetId") assetId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "assets.write");
    const parsed = assetPatchSchema.parse(body);
    const asset = await this.assetsService.updateAsset(
      session!.organization!.id,
      assetId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "assets.asset.update",
      targetType: "fixed_asset",
      targetId: asset.id,
      result: "SUCCESS"
    });
    return asset;
  }

  @Post(":assetId/depreciate")
  async runDepreciation(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("assetId") assetId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "assets.depreciate");
    const parsed = depreciationSchema.parse(body);
    const result = await this.assetsService.runDepreciation(
      session!.organization!.id,
      assetId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "assets.asset.depreciate",
      targetType: "fixed_asset",
      targetId: result.asset.id,
      result: "SUCCESS",
      metadata: {
        depreciationRunId: result.run.id
      }
    });
    return result;
  }
}
