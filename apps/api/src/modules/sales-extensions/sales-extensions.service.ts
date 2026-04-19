import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  CreditNoteStatus,
  RepeatingInvoiceRecord,
  RecurringScheduleStatus,
  SalesCreditNoteDetail,
  SalesCreditNoteSummary,
  SalesInvoiceDetail
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import {
  calculateDocumentLines,
  type DraftDocumentLine,
  toPersistedDocumentLinesWithoutInventory
} from "../sales/document-calculations";
import { SalesService } from "../sales/sales.service";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

@Injectable()
export class SalesExtensionsService {
  private readonly prisma: PrismaService;
  private readonly salesService: SalesService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(SalesService) salesService: SalesService
  ) {
    this.prisma = prisma;
    this.salesService = salesService;
  }

  async listCreditNotes(
    organizationId: string,
    options: { status?: CreditNoteStatus; search?: string }
  ): Promise<SalesCreditNoteSummary[]> {
    const creditNotes = await this.prisma.salesCreditNote.findMany({
      where: {
        organizationId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { creditNoteNumber: { contains: options.search, mode: "insensitive" } },
                { contact: { displayName: { contains: options.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { contact: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    return creditNotes.map((creditNote) => ({
      id: creditNote.id,
      organizationId: creditNote.organizationId,
      contactId: creditNote.contactId,
      contactName: creditNote.contact.displayName,
      salesInvoiceId: creditNote.salesInvoiceId,
      creditNoteNumber: creditNote.creditNoteNumber,
      status: creditNote.status,
      issueDate: creditNote.issueDate.toISOString(),
      currencyCode: creditNote.currencyCode,
      subtotal: money(creditNote.subtotal),
      taxTotal: money(creditNote.taxTotal),
      total: money(creditNote.total),
      createdAt: creditNote.createdAt.toISOString(),
      updatedAt: creditNote.updatedAt.toISOString()
    }));
  }

  async getCreditNote(
    organizationId: string,
    creditNoteId: string
  ): Promise<SalesCreditNoteDetail> {
    const creditNote = await this.prisma.salesCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: {
        contact: true,
        lines: { orderBy: { sortOrder: "asc" } }
      }
    });

    if (!creditNote) {
      throw new NotFoundException("Sales credit note not found.");
    }

    return {
      id: creditNote.id,
      organizationId: creditNote.organizationId,
      contactId: creditNote.contactId,
      contactName: creditNote.contact.displayName,
      salesInvoiceId: creditNote.salesInvoiceId,
      creditNoteNumber: creditNote.creditNoteNumber,
      status: creditNote.status,
      issueDate: creditNote.issueDate.toISOString(),
      currencyCode: creditNote.currencyCode,
      subtotal: money(creditNote.subtotal),
      taxTotal: money(creditNote.taxTotal),
      total: money(creditNote.total),
      notes: creditNote.notes,
      createdAt: creditNote.createdAt.toISOString(),
      updatedAt: creditNote.updatedAt.toISOString(),
      lines: creditNote.lines.map((line) => ({
        id: line.id,
        description: line.description,
        inventoryItemId: null,
        inventoryItemCode: null,
        inventoryItemName: null,
        quantity: money(line.quantity),
        unitPrice: money(line.unitPrice),
        taxRateId: line.taxRateId,
        taxRateName: line.taxRateName,
        taxRatePercent: money(line.taxRatePercent),
        lineSubtotal: money(line.lineSubtotal),
        lineTax: money(line.lineTax),
        lineTotal: money(line.lineTotal),
        sortOrder: line.sortOrder
      }))
    };
  }

  async createCreditNote(
    organizationId: string,
    input: {
      contactId: string;
      salesInvoiceId?: string | null;
      creditNoteNumber?: string | null;
      status: CreditNoteStatus;
      issueDate: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    await this.ensureCustomer(organizationId, input.contactId);
    await this.ensureSalesInvoice(organizationId, input.salesInvoiceId ?? null, input.contactId);
    await this.ensureCreditNoteApplicationAllowed(
      organizationId,
      input.salesInvoiceId ?? null,
      input.status,
      null,
      input.lines
    );

    const resolvedLines = await this.resolveLines(organizationId, input.lines);
    const totals = calculateDocumentLines(resolvedLines);
    const creditNoteNumber =
      input.creditNoteNumber?.trim() ||
      (await this.nextCreditNoteNumber(organizationId));

    const creditNote = await this.prisma.salesCreditNote.create({
      data: {
        organizationId,
        contactId: input.contactId,
        salesInvoiceId: input.salesInvoiceId ?? null,
        creditNoteNumber,
        status: input.status,
        issueDate: new Date(input.issueDate),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: toPersistedDocumentLinesWithoutInventory(totals.lines)
        }
      }
    });

    if (creditNote.salesInvoiceId && creditNote.status === "APPLIED") {
      await this.salesService.refreshInvoiceFinancials(organizationId, creditNote.salesInvoiceId);
    }

    return this.getCreditNote(organizationId, creditNote.id);
  }

  async updateCreditNote(
    organizationId: string,
    creditNoteId: string,
    input: Partial<{
      contactId: string;
      salesInvoiceId: string | null;
      creditNoteNumber: string | null;
      status: CreditNoteStatus;
      issueDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.salesCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Sales credit note not found.");
    }

    this.ensureCreditNoteCanBeUpdated(existing, input);

    const contactId = input.contactId ?? existing.contactId;
    await this.ensureCustomer(organizationId, contactId);
    await this.ensureSalesInvoice(
      organizationId,
      input.salesInvoiceId === undefined ? existing.salesInvoiceId : input.salesInvoiceId,
      contactId
    );

    const sourceLines =
      input.lines ??
      existing.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        taxRateId: line.taxRateId,
        taxRateName: line.taxRateName,
        taxRatePercent: line.taxRatePercent.toString()
      }));
    const resolvedLines = await this.resolveLines(organizationId, sourceLines);
    const totals = calculateDocumentLines(resolvedLines);
    const nextSalesInvoiceId =
      input.salesInvoiceId === undefined ? existing.salesInvoiceId : input.salesInvoiceId;
    const nextStatus = input.status ?? existing.status;

    await this.ensureCreditNoteApplicationAllowed(
      organizationId,
      nextSalesInvoiceId,
      nextStatus,
      existing.id,
      sourceLines
    );

    await this.prisma.salesCreditNote.update({
      where: { id: creditNoteId },
      data: {
        contactId,
        salesInvoiceId:
          nextSalesInvoiceId,
        creditNoteNumber: input.creditNoteNumber?.trim() || existing.creditNoteNumber,
        status: nextStatus,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        currencyCode: input.currencyCode?.toUpperCase() ?? existing.currencyCode,
        notes: input.notes === undefined ? existing.notes : input.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total
      }
    });

    if (input.lines) {
      await this.prisma.salesCreditNoteLine.deleteMany({
        where: { salesCreditNoteId: creditNoteId }
      });
      await this.prisma.salesCreditNoteLine.createMany({
        data: toPersistedDocumentLinesWithoutInventory(totals.lines).map((line) => ({
          salesCreditNoteId: creditNoteId,
          ...line
        }))
      });
    }

    if (existing.salesInvoiceId && existing.salesInvoiceId !== nextSalesInvoiceId) {
      await this.salesService.refreshInvoiceFinancials(organizationId, existing.salesInvoiceId);
    }
    if (nextSalesInvoiceId && nextStatus === "APPLIED") {
      await this.salesService.refreshInvoiceFinancials(organizationId, nextSalesInvoiceId);
    }

    return this.getCreditNote(organizationId, creditNoteId);
  }

  async listRepeatingInvoices(
    organizationId: string,
    options: { status?: RecurringScheduleStatus; search?: string }
  ): Promise<RepeatingInvoiceRecord[]> {
    const schedules = await this.prisma.repeatingInvoice.findMany({
      where: {
        organizationId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { templateName: { contains: options.search, mode: "insensitive" } },
                { contact: { displayName: { contains: options.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: {
        contact: true,
        lines: { orderBy: { sortOrder: "asc" } }
      },
      orderBy: [{ nextRunAt: "asc" }, { createdAt: "desc" }]
    });

    return schedules.map((schedule) => ({
      id: schedule.id,
      organizationId: schedule.organizationId,
      contactId: schedule.contactId,
      contactName: schedule.contact.displayName,
      templateName: schedule.templateName,
      status: schedule.status,
      frequencyLabel: schedule.frequencyLabel,
      intervalCount: schedule.intervalCount,
      nextRunAt: schedule.nextRunAt.toISOString(),
      currencyCode: schedule.currencyCode,
      subtotal: money(schedule.subtotal),
      taxTotal: money(schedule.taxTotal),
      total: money(schedule.total),
      notes: schedule.notes,
      lines: schedule.lines.map((line) => ({
        id: line.id,
        description: line.description,
        inventoryItemId: null,
        inventoryItemCode: null,
        inventoryItemName: null,
        quantity: money(line.quantity),
        unitPrice: money(line.unitPrice),
        taxRateId: line.taxRateId,
        taxRateName: line.taxRateName,
        taxRatePercent: money(line.taxRatePercent),
        lineSubtotal: money(line.lineSubtotal),
        lineTax: money(line.lineTax),
        lineTotal: money(line.lineTotal),
        sortOrder: line.sortOrder
      })),
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString()
    }));
  }

  async getRepeatingInvoice(organizationId: string, repeatingInvoiceId: string) {
    const schedules = await this.listRepeatingInvoices(organizationId, {});
    const schedule = schedules.find((entry) => entry.id === repeatingInvoiceId);

    if (!schedule) {
      throw new NotFoundException("Repeating invoice not found.");
    }

    return schedule;
  }

  async createRepeatingInvoice(
    organizationId: string,
    input: {
      contactId: string;
      templateName: string;
      status: RecurringScheduleStatus;
      frequencyLabel: string;
      intervalCount: number;
      nextRunAt: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    await this.ensureCustomer(organizationId, input.contactId);
    const resolvedLines = await this.resolveLines(organizationId, input.lines);
    const totals = calculateDocumentLines(resolvedLines);

    const schedule = await this.prisma.repeatingInvoice.create({
      data: {
        organizationId,
        contactId: input.contactId,
        templateName: input.templateName,
        status: input.status,
        frequencyLabel: input.frequencyLabel,
        intervalCount: input.intervalCount,
        nextRunAt: new Date(input.nextRunAt),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: toPersistedDocumentLinesWithoutInventory(totals.lines)
        }
      }
    });

    return this.getRepeatingInvoice(organizationId, schedule.id);
  }

  async updateRepeatingInvoice(
    organizationId: string,
    repeatingInvoiceId: string,
    input: Partial<{
      contactId: string;
      templateName: string;
      status: RecurringScheduleStatus;
      frequencyLabel: string;
      intervalCount: number;
      nextRunAt: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.repeatingInvoice.findFirst({
      where: { id: repeatingInvoiceId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Repeating invoice not found.");
    }

    const contactId = input.contactId ?? existing.contactId;
    await this.ensureCustomer(organizationId, contactId);
    const sourceLines =
      input.lines ??
      existing.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        taxRateId: line.taxRateId,
        taxRateName: line.taxRateName,
        taxRatePercent: line.taxRatePercent.toString()
      }));
    const resolvedLines = await this.resolveLines(organizationId, sourceLines);
    const totals = calculateDocumentLines(resolvedLines);

    await this.prisma.repeatingInvoice.update({
      where: { id: repeatingInvoiceId },
      data: {
        contactId,
        templateName: input.templateName ?? existing.templateName,
        status: input.status ?? existing.status,
        frequencyLabel: input.frequencyLabel ?? existing.frequencyLabel,
        intervalCount: input.intervalCount ?? existing.intervalCount,
        nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : existing.nextRunAt,
        currencyCode: input.currencyCode?.toUpperCase() ?? existing.currencyCode,
        notes: input.notes === undefined ? existing.notes : input.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total
      }
    });

    if (input.lines) {
      await this.prisma.repeatingInvoiceLine.deleteMany({
        where: { repeatingInvoiceId }
      });
      await this.prisma.repeatingInvoiceLine.createMany({
        data: toPersistedDocumentLinesWithoutInventory(totals.lines).map((line) => ({
          repeatingInvoiceId,
          ...line
        }))
      });
    }

    return this.getRepeatingInvoice(organizationId, repeatingInvoiceId);
  }

  async runRepeatingInvoice(
    organizationId: string,
    userId: string,
    repeatingInvoiceId: string,
    input?: { runAt?: string | null }
  ): Promise<{
    schedule: RepeatingInvoiceRecord;
    invoice: SalesInvoiceDetail;
  }> {
    const runResult = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.repeatingInvoice.findFirst({
        where: { id: repeatingInvoiceId, organizationId },
        include: { lines: true, contact: true }
      });

      if (!existing) {
        throw new NotFoundException("Repeating invoice not found.");
      }

      if (existing.status !== "ACTIVE") {
        throw new BadRequestException("Only active repeating invoices can be run.");
      }

      const runAt = input?.runAt ? new Date(input.runAt) : existing.nextRunAt;
      if (runAt.getTime() < existing.nextRunAt.getTime()) {
        throw new BadRequestException(
          "Repeating invoices cannot run before the next scheduled date."
        );
      }

      const updateResult = await tx.repeatingInvoice.updateMany({
        where: {
          id: repeatingInvoiceId,
          organizationId,
          status: "ACTIVE",
          nextRunAt: existing.nextRunAt
        },
        data: {
          nextRunAt: this.advanceSchedule(
            runAt,
            existing.frequencyLabel,
            existing.intervalCount
          )
        }
      });

      if (updateResult.count !== 1) {
        throw new BadRequestException(
          "This repeating invoice was already run or updated. Refresh and try again."
        );
      }

      const dueDate = this.addDays(runAt, existing.contact.paymentTermsDays ?? 30);
      const invoice = await this.salesService.createInvoiceRecord(tx, organizationId, userId, {
        contactId: existing.contactId,
        status: "ISSUED",
        complianceInvoiceKind: "STANDARD",
        issueDate: runAt.toISOString(),
        dueDate: dueDate.toISOString(),
        currencyCode: existing.currencyCode,
        notes: existing.notes,
        resolvedLines: existing.lines.map((line) => ({
          description: line.description,
          inventoryItemId: null,
          inventoryItemCode: null,
          inventoryItemName: null,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          taxRateId: line.taxRateId,
          taxRateName: line.taxRateName,
          taxRatePercent: line.taxRatePercent.toString()
        }))
      });

      return {
        contactId: existing.contactId,
        invoiceId: invoice.id
      };
    });

    await this.salesService.refreshContactBalances(organizationId, runResult.contactId);

    return {
      schedule: await this.getRepeatingInvoice(organizationId, repeatingInvoiceId),
      invoice: await this.salesService.getInvoice(organizationId, runResult.invoiceId)
    };
  }

  private async resolveLines(organizationId: string, lines: DraftDocumentLine[]) {
    if (lines.length === 0) {
      throw new BadRequestException("At least one line is required.");
    }

    const taxRateIds = lines
      .map((line) => line.taxRateId)
      .filter((value): value is string => Boolean(value));
    const taxRates = taxRateIds.length
      ? await this.prisma.taxRate.findMany({
          where: { organizationId, id: { in: taxRateIds } }
        })
      : [];
    const taxRateMap = new Map(taxRates.map((taxRate) => [taxRate.id, taxRate]));

    return lines.map((line) => {
      const taxRate = line.taxRateId ? taxRateMap.get(line.taxRateId) : null;
      return {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRateId: taxRate?.id ?? null,
        taxRateName: taxRate?.name ?? line.taxRateName ?? null,
        taxRatePercent: taxRate?.rate.toString() ?? line.taxRatePercent ?? 0
      };
    });
  }

  private async ensureCustomer(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, isCustomer: true }
    });

    if (!contact) {
      throw new NotFoundException("Customer contact not found.");
    }
  }

  private async ensureSalesInvoice(
    organizationId: string,
    salesInvoiceId: string | null,
    contactId?: string
  ) {
    if (!salesInvoiceId) {
      return;
    }

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: salesInvoiceId, organizationId },
      select: {
        id: true,
        contactId: true
      }
    });

    if (!invoice) {
      throw new NotFoundException("Sales invoice not found.");
    }

    if (contactId && invoice.contactId !== contactId) {
      throw new BadRequestException(
        "Applied credit notes must stay linked to the same customer as the invoice."
      );
    }
  }

  private async nextCreditNoteNumber(organizationId: string) {
    const count = await this.prisma.salesCreditNote.count({
      where: { organizationId }
    });

    return `SCN-${String(count + 1).padStart(4, "0")}`;
  }

  private ensureCreditNoteCanBeUpdated(
    existing: {
      status: CreditNoteStatus;
    },
    input: Partial<{
      contactId: string;
      salesInvoiceId: string | null;
      creditNoteNumber: string | null;
      status: CreditNoteStatus;
      issueDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    if (existing.status === "APPLIED" && input.status && input.status !== "APPLIED") {
      throw new BadRequestException("Applied credit notes cannot be reopened.");
    }

    if (existing.status !== "DRAFT") {
      const changedStructure =
        input.contactId !== undefined ||
        input.salesInvoiceId !== undefined ||
        input.creditNoteNumber !== undefined ||
        input.issueDate !== undefined ||
        input.currencyCode !== undefined ||
        input.lines !== undefined;

      if (changedStructure) {
        throw new BadRequestException(
          "Issued credit notes only allow status and note updates."
        );
      }
    }
  }

  private async ensureCreditNoteApplicationAllowed(
    organizationId: string,
    salesInvoiceId: string | null,
    status: CreditNoteStatus,
    excludeCreditNoteId: string | null,
    lines: DraftDocumentLine[]
  ) {
    if (status !== "APPLIED") {
      return;
    }

    if (!salesInvoiceId) {
      throw new BadRequestException("Applied credit notes must be linked to an invoice.");
    }

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: salesInvoiceId, organizationId },
      select: {
        total: true
      }
    });

    if (!invoice) {
      throw new NotFoundException("Sales invoice not found.");
    }

    const nextTotal = Number(calculateDocumentLines(await this.resolveLines(organizationId, lines)).total);
    const appliedCredits = await this.prisma.salesCreditNote.aggregate({
      where: {
        organizationId,
        salesInvoiceId,
        status: "APPLIED",
        ...(excludeCreditNoteId ? { id: { not: excludeCreditNoteId } } : {})
      },
      _sum: { total: true }
    });
    const appliedTotal = Number(appliedCredits._sum.total ?? 0) + nextTotal;

    if (appliedTotal > Number(invoice.total) + 0.000001) {
      throw new BadRequestException(
        "Applied credit notes cannot exceed the invoice total."
      );
    }
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private advanceSchedule(value: Date, frequencyLabel: string, intervalCount: number) {
    const next = new Date(value);
    const frequency = frequencyLabel.trim().toLowerCase();

    if (frequency.includes("week")) {
      next.setUTCDate(next.getUTCDate() + 7 * intervalCount);
      return next;
    }

    if (frequency.includes("quarter")) {
      next.setUTCMonth(next.getUTCMonth() + 3 * intervalCount);
      return next;
    }

    if (frequency.includes("year")) {
      next.setUTCFullYear(next.getUTCFullYear() + intervalCount);
      return next;
    }

    if (frequency.includes("day")) {
      next.setUTCDate(next.getUTCDate() + intervalCount);
      return next;
    }

    next.setUTCMonth(next.getUTCMonth() + intervalCount);
    return next;
  }
}
