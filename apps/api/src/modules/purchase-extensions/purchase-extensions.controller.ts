import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  creditNoteStatuses,
  purchaseOrderStatuses,
  recurringScheduleStatuses
} from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { PurchaseExtensionsService } from "./purchase-extensions.service";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRateId: z.string().optional().nullable()
});

const purchaseCreditNoteSchema = z.object({
  contactId: z.string().min(1),
  purchaseBillId: z.string().optional().nullable(),
  creditNoteNumber: z.string().optional().nullable(),
  status: z.enum(creditNoteStatuses).default("DRAFT"),
  issueDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const purchaseCreditNotePatchSchema = purchaseCreditNoteSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const purchaseOrderSchema = z.object({
  contactId: z.string().min(1),
  orderNumber: z.string().optional().nullable(),
  status: z.enum(purchaseOrderStatuses).default("DRAFT"),
  issueDate: z.string().min(1),
  expectedDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const purchaseOrderPatchSchema = purchaseOrderSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const repeatingBillSchema = z.object({
  contactId: z.string().min(1),
  templateName: z.string().min(1),
  status: z.enum(recurringScheduleStatuses).default("ACTIVE"),
  frequencyLabel: z.string().min(1),
  intervalCount: z.number().int().positive().default(1),
  nextRunAt: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const repeatingBillPatchSchema = repeatingBillSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const repeatingBillRunSchema = z.object({
  runAt: z.string().optional().nullable()
});

@Controller("v1/purchases")
@UseGuards(AuthenticatedGuard)
export class PurchaseExtensionsController {
  private readonly purchaseExtensionsService: PurchaseExtensionsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(PurchaseExtensionsService)
    purchaseExtensionsService: PurchaseExtensionsService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.purchaseExtensionsService = purchaseExtensionsService;
    this.auditService = auditService;
  }

  @Get("credit-notes")
  listCreditNotes(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "purchases.credit_notes.read");
    return this.purchaseExtensionsService.listCreditNotes(session!.organization!.id, {
      status: status ? z.enum(creditNoteStatuses).parse(status) : undefined,
      search: search?.trim() || undefined
    });
  }

  @Post("credit-notes")
  async createCreditNote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.credit_notes.write");
    const parsed = purchaseCreditNoteSchema.parse(body);
    const creditNote = await this.purchaseExtensionsService.createCreditNote(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.credit_note.create",
      targetType: "purchase_credit_note",
      targetId: creditNote.id,
      result: "SUCCESS"
    });
    return creditNote;
  }

  @Get("credit-notes/:creditNoteId")
  getCreditNote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("creditNoteId") creditNoteId: string
  ) {
    requirePermission(session, "purchases.credit_notes.read");
    return this.purchaseExtensionsService.getCreditNote(
      session!.organization!.id,
      creditNoteId
    );
  }

  @Patch("credit-notes/:creditNoteId")
  async updateCreditNote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("creditNoteId") creditNoteId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.credit_notes.write");
    const parsed = purchaseCreditNotePatchSchema.parse(body);
    const creditNote = await this.purchaseExtensionsService.updateCreditNote(
      session!.organization!.id,
      creditNoteId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.credit_note.update",
      targetType: "purchase_credit_note",
      targetId: creditNote.id,
      result: "SUCCESS"
    });
    return creditNote;
  }

  @Get("orders")
  listOrders(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "purchases.orders.read");
    return this.purchaseExtensionsService.listOrders(session!.organization!.id, {
      status: status ? z.enum(purchaseOrderStatuses).parse(status) : undefined,
      search: search?.trim() || undefined
    });
  }

  @Post("orders")
  async createOrder(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.orders.write");
    const parsed = purchaseOrderSchema.parse(body);
    const order = await this.purchaseExtensionsService.createOrder(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.order.create",
      targetType: "purchase_order",
      targetId: order.id,
      result: "SUCCESS"
    });
    return order;
  }

  @Get("orders/:orderId")
  getOrder(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("orderId") orderId: string
  ) {
    requirePermission(session, "purchases.orders.read");
    return this.purchaseExtensionsService.getOrder(session!.organization!.id, orderId);
  }

  @Patch("orders/:orderId")
  async updateOrder(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("orderId") orderId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.orders.write");
    const parsed = purchaseOrderPatchSchema.parse(body);
    const order = await this.purchaseExtensionsService.updateOrder(
      session!.organization!.id,
      orderId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.order.update",
      targetType: "purchase_order",
      targetId: order.id,
      result: "SUCCESS"
    });
    return order;
  }

  @Get("repeating-bills")
  listRepeatingBills(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "purchases.repeating.read");
    return this.purchaseExtensionsService.listRepeatingBills(session!.organization!.id, {
      status: status ? z.enum(recurringScheduleStatuses).parse(status) : undefined,
      search: search?.trim() || undefined
    });
  }

  @Post("repeating-bills")
  async createRepeatingBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.repeating.write");
    const parsed = repeatingBillSchema.parse(body);
    const schedule = await this.purchaseExtensionsService.createRepeatingBill(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.repeating_bill.create",
      targetType: "repeating_bill",
      targetId: schedule.id,
      result: "SUCCESS"
    });
    return schedule;
  }

  @Get("repeating-bills/:repeatingBillId")
  getRepeatingBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingBillId") repeatingBillId: string
  ) {
    requirePermission(session, "purchases.repeating.read");
    return this.purchaseExtensionsService.getRepeatingBill(
      session!.organization!.id,
      repeatingBillId
    );
  }

  @Patch("repeating-bills/:repeatingBillId")
  async updateRepeatingBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingBillId") repeatingBillId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.repeating.write");
    const parsed = repeatingBillPatchSchema.parse(body);
    const schedule = await this.purchaseExtensionsService.updateRepeatingBill(
      session!.organization!.id,
      repeatingBillId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.repeating_bill.update",
      targetType: "repeating_bill",
      targetId: schedule.id,
      result: "SUCCESS"
    });
    return schedule;
  }

  @Post("repeating-bills/:repeatingBillId/run")
  async runRepeatingBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingBillId") repeatingBillId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.repeating.write");
    const parsed = repeatingBillRunSchema.parse(body ?? {});
    const result = await this.purchaseExtensionsService.runRepeatingBill(
      session!.organization!.id,
      repeatingBillId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.repeating_bill.run",
      targetType: "repeating_bill",
      targetId: result.schedule.id,
      result: "SUCCESS",
      metadata: {
        generatedBillId: result.bill.id
      }
    });
    return result;
  }
}
