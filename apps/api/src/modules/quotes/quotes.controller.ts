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
import { quoteStatuses } from "@daftar/types";
import type { Response } from "express";
import { z } from "zod";

import { buildDocumentPdf, type DocumentPdfVariant } from "../../common/utils/document-pdf";
import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { QuotesService } from "./quotes.service";

const lineSchema = z.object({
  description: z.string().optional().nullable(),
  inventoryItemId: z.string().optional().nullable(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRateId: z.string().optional().nullable()
});

const quoteSchema = z.object({
  contactId: z.string().min(1),
  quoteNumber: z.string().optional().nullable(),
  status: z.enum(quoteStatuses).default("DRAFT"),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const quotePatchSchema = quoteSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const exportVariantSchema = z.enum(["full", "small"]);

@Controller("v1/quotes")
@UseGuards(AuthenticatedGuard)
export class QuotesController {
  private readonly quotesService: QuotesService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(QuotesService) quotesService: QuotesService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.quotesService = quotesService;
    this.auditService = auditService;
  }

  @Get()
  listQuotes(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined,
    @Query("contactId") contactId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ) {
    requirePermission(session, "quotes.read");
    return this.quotesService.listQuotes(session!.organization!.id, {
      status: status ? z.enum(quoteStatuses).parse(status) : undefined,
      search: search?.trim() || undefined,
      contactId: contactId?.trim() || undefined,
      dateFrom: from?.trim() || undefined,
      dateTo: to?.trim() || undefined
    });
  }

  @Post()
  async createQuote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "quotes.write");
    const parsed = quoteSchema.parse(body);
    const quote = await this.quotesService.createQuote(session!.organization!.id, parsed);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "quotes.quote.create",
      targetType: "quote",
      targetId: quote.id,
      result: "SUCCESS"
    });
    return quote;
  }

  @Get(":quoteId")
  getQuote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("quoteId") quoteId: string
  ) {
    requirePermission(session, "quotes.read");
    return this.quotesService.getQuote(session!.organization!.id, quoteId);
  }

  @Patch(":quoteId")
  async updateQuote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("quoteId") quoteId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "quotes.write");
    const parsed = quotePatchSchema.parse(body);
    const quote = await this.quotesService.updateQuote(
      session!.organization!.id,
      quoteId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "quotes.quote.update",
      targetType: "quote",
      targetId: quote.id,
      result: "SUCCESS"
    });
    return quote;
  }

  @Post(":quoteId/convert")
  async convertQuote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("quoteId") quoteId: string
  ) {
    requirePermission(session, "quotes.convert");
    const conversion = await this.quotesService.convertQuote(
      session!.organization!.id,
      quoteId
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "quotes.quote.convert",
      targetType: "quote",
      targetId: quoteId,
      result: "SUCCESS",
      metadata: {
        invoiceId: conversion.invoiceId
      }
    });
    return conversion;
  }

  @Get(":quoteId/export")
  async exportQuote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("quoteId") quoteId: string,
    @Query("variant") variant: string | undefined,
    @Res() response: Response
  ) {
    requirePermission(session, "quotes.read");
    const resolvedVariant = exportVariantSchema.parse(variant ?? "full") as Exclude<
      DocumentPdfVariant,
      "packing-slip"
    >;
    const quote = await this.quotesService.getQuote(session!.organization!.id, quoteId);
    const pdf = await buildDocumentPdf(
      {
        title: resolvedVariant === "small" ? "Compact Quote" : "Quote",
        number: quote.quoteNumber,
        status: quote.status,
        contactName: quote.contactName,
        contactEmail: quote.contactEmail,
        issueDate: quote.issueDate,
        dueLabel: "Expiry Date",
        dueValue: quote.expiryDate,
        currencyCode: quote.currencyCode,
        notes: quote.notes,
        lines: quote.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxLabel: line.taxRateName
            ? `${line.taxRateName} (${line.taxRatePercent}%)`
            : "No tax",
          lineTotal: line.lineTotal
        })),
        totals: [
          { label: "Subtotal", value: quote.subtotal },
          { label: "Tax", value: quote.taxTotal },
          { label: "Total", value: quote.total }
        ]
      },
      resolvedVariant
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${quote.quoteNumber.toLowerCase()}-${resolvedVariant}.pdf"`
    );
    response.send(pdf);
  }
}
