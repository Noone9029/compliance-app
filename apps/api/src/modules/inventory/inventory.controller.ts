import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { InventoryService } from "./inventory.service";

const itemSchema = z.object({
  itemCode: z.string().min(1),
  itemName: z.string().min(1),
  description: z.string().optional().nullable(),
  costPrice: z.string().min(1),
  salePrice: z.string().min(1),
  quantityOnHand: z.string().optional(),
});

const stockAdjustmentSchema = z.object({
  movementType: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  quantity: z.string().min(1),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const deleteItemsSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});

const importItemsSchema = z.object({
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

@Controller("v1/inventory")
@UseGuards(AuthenticatedGuard)
export class InventoryController {
  private readonly inventoryService: InventoryService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(InventoryService) inventoryService: InventoryService,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.inventoryService = inventoryService;
    this.auditService = auditService;
  }

  @Get("items")
  listItems(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("search") search?: string,
  ) {
    requirePermission(session, "inventory.read");
    return this.inventoryService.listItems(session!.organization!.id, search);
  }

  @Get("items/:itemId")
  getItem(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("itemId") itemId: string,
  ) {
    requirePermission(session, "inventory.read");
    return this.inventoryService.getItem(session!.organization!.id, itemId);
  }

  @Post("items")
  async createItem(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
  ) {
    requirePermission(session, "inventory.write");
    const parsed = itemSchema.parse(body);
    const item = await this.inventoryService.createItem(
      session!.organization!.id,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "inventory.item.create",
      targetType: "inventory_item",
      targetId: item.id,
      result: "SUCCESS",
    });
    return item;
  }

  @Patch("items/:itemId")
  async updateItem(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    requirePermission(session, "inventory.write");
    const parsed = itemSchema.omit({ quantityOnHand: true }).parse(body);
    const item = await this.inventoryService.updateItem(
      session!.organization!.id,
      itemId,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "inventory.item.update",
      targetType: "inventory_item",
      targetId: item.id,
      result: "SUCCESS",
    });
    return item;
  }

  @Delete("items")
  async deleteItems(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
  ) {
    requirePermission(session, "inventory.write");
    const parsed = deleteItemsSchema.parse(body);
    const result = await this.inventoryService.deleteItems(
      session!.organization!.id,
      parsed.itemIds,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "inventory.item.delete",
      targetType: "inventory_item",
      targetId: null,
      result: "SUCCESS",
      metadata: {
        itemIds: parsed.itemIds,
        deletedCount: result.deletedCount,
      },
    });
    return result;
  }

  @Post("imports")
  async importItems(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
  ) {
    requirePermission(session, "inventory.write");
    const parsed = importItemsSchema.parse(body);
    const result = await this.inventoryService.importItems(
      session!.organization!.id,
      session!.user!.id,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "inventory.import.create",
      targetType: "inventory_import",
      targetId: result.fileId,
      result: "SUCCESS",
      metadata: result,
    });
    return result;
  }

  @Post("items/:itemId/adjustments")
  async adjustStock(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    requirePermission(session, "inventory.write");
    const parsed = stockAdjustmentSchema.parse(body);
    const item = await this.inventoryService.adjustStock(
      session!.organization!.id,
      itemId,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "inventory.stock.adjust",
      targetType: "inventory_item",
      targetId: item.id,
      result: "SUCCESS",
      metadata: {
        movementType: parsed.movementType,
        quantity: parsed.quantity,
      },
    });
    return item;
  }
}
