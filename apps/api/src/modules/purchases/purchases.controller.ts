import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { purchaseBillStatuses } from "@daftar/types";
import type { Response } from "express";
import { z } from "zod";

import { buildDocumentPdf, type DocumentPdfVariant } from "../../common/utils/document-pdf";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { PurchasesService } from "./purchases.service";

const lineSchema = z.object({
  description: z.string().optional().nullable(),
  inventoryItemId: z.string().optional().nullable(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRateId: z.string().optional().nullable()
});

const billSchema = z.object({
  contactId: z.string().min(1),
  billNumber: z.string().optional().nullable(),
  status: z.enum(purchaseBillStatuses).default("DRAFT"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const billPatchSchema = billSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const paymentSchema = z.object({
  bankAccountId: z.string().min(1),
  paymentDate: z.string().min(1),
  amount: z.string().min(1),
  method: z.string().min(1),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const exportVariantSchema = z.enum(["full", "small"]);

@Controller("v1/purchases")
@UseGuards(AuthenticatedGuard)
export class PurchasesController {
  private readonly purchasesService: PurchasesService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(PurchasesService) purchasesService: PurchasesService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.purchasesService = purchasesService;
    this.auditService = auditService;
  }

  @Get("bills")
  listBills(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined,
    @Query("contactId") contactId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    requirePermission(session, "purchases.read");
    return this.purchasesService.listBills(session!.organization!.id, {
      status: status ? z.enum(purchaseBillStatuses).parse(status) : undefined,
      search: search?.trim() || undefined,
      contactId: contactId?.trim() || undefined,
      dateFrom: from?.trim() || undefined,
      dateTo: to?.trim() || undefined
    });
  }

  @Post("bills")
  async createBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.write");
    const parsed = billSchema.parse(body);
    const bill = await this.purchasesService.createBill(session!.organization!.id, parsed);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.bill.create",
      targetType: "purchase_bill",
      targetId: bill.id,
      result: "SUCCESS"
    });
    return bill;
  }

  @Get("bills/:billId")
  getBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("billId") billId: string
  ) {
    requirePermission(session, "purchases.read");
    return this.purchasesService.getBill(session!.organization!.id, billId);
  }

  @Patch("bills/:billId")
  async updateBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("billId") billId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.write");
    const parsed = billPatchSchema.parse(body);
    const bill = await this.purchasesService.updateBill(
      session!.organization!.id,
      billId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.bill.update",
      targetType: "purchase_bill",
      targetId: bill.id,
      result: "SUCCESS"
    });
    return bill;
  }

  @Post("bills/:billId/payments")
  async recordPayment(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("billId") billId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "purchases.write");
    const parsed = paymentSchema.parse(body);
    const bill = await this.purchasesService.recordPayment(
      session!.organization!.id,
      billId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "purchases.bill.payment",
      targetType: "purchase_bill",
      targetId: bill.id,
      result: "SUCCESS"
    });
    return bill;
  }

  @Get("bills/:billId/export")
  async exportBill(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("billId") billId: string,
    @Query("variant") variant: string | undefined,
    @Res() response: Response
  ) {
    requirePermission(session, "purchases.read");
    const resolvedVariant = exportVariantSchema.parse(variant ?? "full") as Exclude<
      DocumentPdfVariant,
      "packing-slip"
    >;
    const bill = await this.purchasesService.getBill(session!.organization!.id, billId);
    const pdf = await buildDocumentPdf(
      {
        title: resolvedVariant === "small" ? "Compact Bill" : "Supplier Bill",
        number: bill.billNumber,
        status: bill.status,
        contactName: bill.contactName,
        contactEmail: bill.contactEmail,
        issueDate: bill.issueDate,
        dueLabel: "Due Date",
        dueValue: bill.dueDate,
        currencyCode: bill.currencyCode,
        notes: bill.notes,
        lines: bill.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxLabel: line.taxRateName
            ? `${line.taxRateName} (${line.taxRatePercent}%)`
            : "No tax",
          lineTotal: line.lineTotal
        })),
        totals: [
          { label: "Subtotal", value: bill.subtotal },
          { label: "Tax", value: bill.taxTotal },
          { label: "Total", value: bill.total },
          { label: "Amount Due", value: bill.amountDue }
        ]
      },
      resolvedVariant
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${bill.billNumber.toLowerCase()}-${resolvedVariant}.pdf"`
    );
    response.send(pdf);
  }
}
