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
import { creditNoteStatuses, recurringScheduleStatuses } from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { SalesExtensionsService } from "./sales-extensions.service";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  taxRateId: z.string().optional().nullable()
});

const creditNoteSchema = z.object({
  contactId: z.string().min(1),
  salesInvoiceId: z.string().optional().nullable(),
  creditNoteNumber: z.string().optional().nullable(),
  status: z.enum(creditNoteStatuses).default("DRAFT"),
  issueDate: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1)
});

const creditNotePatchSchema = creditNoteSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const repeatingInvoiceSchema = z.object({
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

const repeatingInvoicePatchSchema = repeatingInvoiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const repeatingInvoiceRunSchema = z.object({
  runAt: z.string().optional().nullable()
});

@Controller("v1/sales")
@UseGuards(AuthenticatedGuard)
export class SalesExtensionsController {
  private readonly salesExtensionsService: SalesExtensionsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(SalesExtensionsService) salesExtensionsService: SalesExtensionsService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.salesExtensionsService = salesExtensionsService;
    this.auditService = auditService;
  }

  @Get("credit-notes")
  listCreditNotes(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "sales.credit_notes.read");
    return this.salesExtensionsService.listCreditNotes(session!.organization!.id, {
      status: status ? z.enum(creditNoteStatuses).parse(status) : undefined,
      search: search?.trim() || undefined
    });
  }

  @Post("credit-notes")
  async createCreditNote(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.credit_notes.write");
    const parsed = creditNoteSchema.parse(body);
    const creditNote = await this.salesExtensionsService.createCreditNote(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.credit_note.create",
      targetType: "sales_credit_note",
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
    requirePermission(session, "sales.credit_notes.read");
    return this.salesExtensionsService.getCreditNote(
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
    requirePermission(session, "sales.credit_notes.write");
    const parsed = creditNotePatchSchema.parse(body);
    const creditNote = await this.salesExtensionsService.updateCreditNote(
      session!.organization!.id,
      creditNoteId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.credit_note.update",
      targetType: "sales_credit_note",
      targetId: creditNote.id,
      result: "SUCCESS"
    });
    return creditNote;
  }

  @Get("repeating-invoices")
  listRepeatingInvoices(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "sales.repeating.read");
    return this.salesExtensionsService.listRepeatingInvoices(session!.organization!.id, {
      status: status ? z.enum(recurringScheduleStatuses).parse(status) : undefined,
      search: search?.trim() || undefined
    });
  }

  @Post("repeating-invoices")
  async createRepeatingInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.repeating.write");
    const parsed = repeatingInvoiceSchema.parse(body);
    const schedule = await this.salesExtensionsService.createRepeatingInvoice(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.repeating_invoice.create",
      targetType: "repeating_invoice",
      targetId: schedule.id,
      result: "SUCCESS"
    });
    return schedule;
  }

  @Get("repeating-invoices/:repeatingInvoiceId")
  getRepeatingInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingInvoiceId") repeatingInvoiceId: string
  ) {
    requirePermission(session, "sales.repeating.read");
    return this.salesExtensionsService.getRepeatingInvoice(
      session!.organization!.id,
      repeatingInvoiceId
    );
  }

  @Patch("repeating-invoices/:repeatingInvoiceId")
  async updateRepeatingInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingInvoiceId") repeatingInvoiceId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.repeating.write");
    const parsed = repeatingInvoicePatchSchema.parse(body);
    const schedule = await this.salesExtensionsService.updateRepeatingInvoice(
      session!.organization!.id,
      repeatingInvoiceId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.repeating_invoice.update",
      targetType: "repeating_invoice",
      targetId: schedule.id,
      result: "SUCCESS"
    });
    return schedule;
  }

  @Post("repeating-invoices/:repeatingInvoiceId/run")
  async runRepeatingInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("repeatingInvoiceId") repeatingInvoiceId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "sales.repeating.write");
    const parsed = repeatingInvoiceRunSchema.parse(body ?? {});
    const result = await this.salesExtensionsService.runRepeatingInvoice(
      session!.organization!.id,
      session!.user!.id,
      repeatingInvoiceId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "sales.repeating_invoice.run",
      targetType: "repeating_invoice",
      targetId: result.schedule.id,
      result: "SUCCESS",
      metadata: {
        generatedInvoiceId: result.invoice.id
      }
    });
    return result;
  }
}
