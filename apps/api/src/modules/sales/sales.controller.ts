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
import {
  complianceInvoiceKinds,
  salesInvoiceStatuses
} from "@daftar/types";
import type { Response } from "express";
import { z } from "zod";

import { buildDocumentPdf, type DocumentPdfVariant } from "../../common/utils/document-pdf";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { SalesService } from "./sales.service";

const lineSchema = z.object({
  description: z.string().optional().nullable(),
  inventoryItemId: z.string().optional().nullable(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRateId: z.string().optional().nullable()
});

const invoiceSchema = z.object({
  contactId: z.string().min(1),
  invoiceNumber: z.string().optional().nullable(),
  status: z.enum(salesInvoiceStatuses).default("DRAFT"),
  complianceInvoiceKind: z.enum(complianceInvoiceKinds).default("STANDARD"),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const invoicePatchSchema = invoiceSchema
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

const exportVariantSchema = z.enum(["full", "packing-slip", "small"]);

@Controller("v1/sales")
@UseGuards(AuthenticatedGuard)
export class SalesController {
  private readonly salesService: SalesService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(SalesService) salesService: SalesService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.salesService = salesService;
    this.auditService = auditService;
  }

  @Get("invoices")
  listInvoices(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined,
    @Query("contactId") contactId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    requirePermission(session, "sales.read");
    return this.salesService.listInvoices(session!.organization!.id, {
      status: status ? z.enum(salesInvoiceStatuses).parse(status) : undefined,
      search: search?.trim() || undefined,
      contactId: contactId?.trim() || undefined,
      dateFrom: from?.trim() || undefined,
      dateTo: to?.trim() || undefined
    });
  }

  @Post("invoices")
  async createInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.write");
    const parsed = invoiceSchema.parse(body);
    const invoice = await this.salesService.createInvoice(
      session!.organization!.id,
      session!.user!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.invoice.create",
      targetType: "sales_invoice",
      targetId: invoice.id,
      result: "SUCCESS"
    });
    return invoice;
  }

  @Get("invoices/:invoiceId")
  getInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string
  ) {
    requirePermission(session, "sales.read");
    return this.salesService.getInvoice(session!.organization!.id, invoiceId);
  }

  @Patch("invoices/:invoiceId")
  async updateInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.write");
    const parsed = invoicePatchSchema.parse(body);
    const invoice = await this.salesService.updateInvoice(
      session!.organization!.id,
      session!.user!.id,
      invoiceId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.invoice.update",
      targetType: "sales_invoice",
      targetId: invoice.id,
      result: "SUCCESS"
    });
    return invoice;
  }

  @Post("invoices/:invoiceId/payments")
  async recordPayment(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.write");
    const parsed = paymentSchema.parse(body);
    const invoice = await this.salesService.recordPayment(
      session!.organization!.id,
      session!.user!.id,
      invoiceId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.invoice.payment",
      targetType: "sales_invoice",
      targetId: invoice.id,
      result: "SUCCESS"
    });
    return invoice;
  }

  @Get("invoices/:invoiceId/export")
  async exportInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("invoiceId") invoiceId: string,
    @Query("variant") variant: string | undefined,
    @Res() response: Response
  ) {
    requirePermission(session, "sales.read");
    const resolvedVariant = exportVariantSchema.parse(variant ?? "full") as DocumentPdfVariant;
    const invoice = await this.salesService.getInvoice(session!.organization!.id, invoiceId);
    const pdf = await buildDocumentPdf(
      {
        title:
          resolvedVariant === "packing-slip"
            ? "Packing Slip"
            : resolvedVariant === "small"
              ? "Small Invoice"
              : "Tax Invoice",
        number: invoice.invoiceNumber,
        status: invoice.status,
        contactName: invoice.contactName,
        contactEmail: invoice.contactEmail,
        issueDate: invoice.issueDate,
        dueLabel: "Due Date",
        dueValue: invoice.dueDate,
        currencyCode: invoice.currencyCode,
        notes: invoice.notes,
        lines: invoice.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxLabel: line.taxRateName
            ? `${line.taxRateName} (${line.taxRatePercent}%)`
            : "No tax",
          lineTotal: line.lineTotal
        })),
        totals: [
          { label: "Subtotal", value: invoice.subtotal },
          { label: "Tax", value: invoice.taxTotal },
          { label: "Total", value: invoice.total },
          { label: "Amount Due", value: invoice.amountDue }
        ]
      },
      resolvedVariant
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoice.invoiceNumber.toLowerCase()}-${resolvedVariant}.pdf"`
    );
    response.send(pdf);
  }
}
