import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  CreditNoteStatus,
  PurchaseCreditNoteDetail,
  PurchaseCreditNoteSummary,
  PurchaseBillDetail,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  PurchaseOrderSummary,
  RecurringScheduleStatus,
  RepeatingBillRecord
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import {
  calculateDocumentLines,
  type DraftDocumentLine,
  toPersistedDocumentLinesWithoutInventory
} from "../sales/document-calculations";
import { PurchasesService } from "../purchases/purchases.service";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

@Injectable()
export class PurchaseExtensionsService {
  private readonly prisma: PrismaService;
  private readonly purchasesService: PurchasesService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(PurchasesService) purchasesService: PurchasesService
  ) {
    this.prisma = prisma;
    this.purchasesService = purchasesService;
  }

  async listCreditNotes(
    organizationId: string,
    options: { status?: CreditNoteStatus; search?: string }
  ): Promise<PurchaseCreditNoteSummary[]> {
    const creditNotes = await this.prisma.purchaseCreditNote.findMany({
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
      purchaseBillId: creditNote.purchaseBillId,
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
  ): Promise<PurchaseCreditNoteDetail> {
    const creditNote = await this.prisma.purchaseCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: {
        contact: true,
        lines: { orderBy: { sortOrder: "asc" } }
      }
    });

    if (!creditNote) {
      throw new NotFoundException("Purchase credit note not found.");
    }

    return {
      id: creditNote.id,
      organizationId: creditNote.organizationId,
      contactId: creditNote.contactId,
      contactName: creditNote.contact.displayName,
      purchaseBillId: creditNote.purchaseBillId,
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
      purchaseBillId?: string | null;
      creditNoteNumber?: string | null;
      status: CreditNoteStatus;
      issueDate: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    await this.ensureSupplier(organizationId, input.contactId);
    await this.ensurePurchaseBill(organizationId, input.purchaseBillId ?? null, input.contactId);
    await this.ensurePurchaseCreditApplicationAllowed(
      organizationId,
      input.purchaseBillId ?? null,
      input.status,
      null,
      input.lines
    );
    const resolvedLines = await this.resolveLines(organizationId, input.lines);
    const totals = calculateDocumentLines(resolvedLines);
    const creditNoteNumber =
      input.creditNoteNumber?.trim() ||
      (await this.nextCreditNoteNumber(organizationId));

    const creditNote = await this.prisma.purchaseCreditNote.create({
      data: {
        organizationId,
        contactId: input.contactId,
        purchaseBillId: input.purchaseBillId ?? null,
        creditNoteNumber,
        status: input.status,
        issueDate: new Date(input.issueDate),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: { create: toPersistedDocumentLinesWithoutInventory(totals.lines) }
      }
    });

    if (creditNote.purchaseBillId && creditNote.status === "APPLIED") {
      await this.purchasesService.refreshBillFinancials(
        organizationId,
        creditNote.purchaseBillId
      );
    }

    return this.getCreditNote(organizationId, creditNote.id);
  }

  async updateCreditNote(
    organizationId: string,
    creditNoteId: string,
    input: Partial<{
      contactId: string;
      purchaseBillId: string | null;
      creditNoteNumber: string | null;
      status: CreditNoteStatus;
      issueDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.purchaseCreditNote.findFirst({
      where: { id: creditNoteId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Purchase credit note not found.");
    }

    this.ensurePurchaseCreditNoteCanBeUpdated(existing, input);

    const contactId = input.contactId ?? existing.contactId;
    await this.ensureSupplier(organizationId, contactId);
    await this.ensurePurchaseBill(
      organizationId,
      input.purchaseBillId === undefined ? existing.purchaseBillId : input.purchaseBillId,
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
    const nextPurchaseBillId =
      input.purchaseBillId === undefined ? existing.purchaseBillId : input.purchaseBillId;
    const nextStatus = input.status ?? existing.status;

    await this.ensurePurchaseCreditApplicationAllowed(
      organizationId,
      nextPurchaseBillId,
      nextStatus,
      existing.id,
      sourceLines
    );

    await this.prisma.purchaseCreditNote.update({
      where: { id: creditNoteId },
      data: {
        contactId,
        purchaseBillId:
          nextPurchaseBillId,
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
      await this.prisma.purchaseCreditNoteLine.deleteMany({
        where: { purchaseCreditNoteId: creditNoteId }
      });
      await this.prisma.purchaseCreditNoteLine.createMany({
        data: toPersistedDocumentLinesWithoutInventory(totals.lines).map((line) => ({
          purchaseCreditNoteId: creditNoteId,
          ...line
        }))
      });
    }

    if (existing.purchaseBillId && existing.purchaseBillId !== nextPurchaseBillId) {
      await this.purchasesService.refreshBillFinancials(organizationId, existing.purchaseBillId);
    }
    if (nextPurchaseBillId && nextStatus === "APPLIED") {
      await this.purchasesService.refreshBillFinancials(organizationId, nextPurchaseBillId);
    }

    return this.getCreditNote(organizationId, creditNoteId);
  }

  async listOrders(
    organizationId: string,
    options: { status?: PurchaseOrderStatus; search?: string }
  ): Promise<PurchaseOrderSummary[]> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { orderNumber: { contains: options.search, mode: "insensitive" } },
                { contact: { displayName: { contains: options.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { contact: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    return orders.map((order) => ({
      id: order.id,
      organizationId: order.organizationId,
      contactId: order.contactId,
      contactName: order.contact.displayName,
      orderNumber: order.orderNumber,
      status: order.status,
      issueDate: order.issueDate.toISOString(),
      expectedDate: order.expectedDate.toISOString(),
      currencyCode: order.currencyCode,
      subtotal: money(order.subtotal),
      taxTotal: money(order.taxTotal),
      total: money(order.total),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    }));
  }

  async getOrder(organizationId: string, orderId: string): Promise<PurchaseOrderDetail> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, organizationId },
      include: {
        contact: true,
        lines: { orderBy: { sortOrder: "asc" } }
      }
    });

    if (!order) {
      throw new NotFoundException("Purchase order not found.");
    }

    return {
      id: order.id,
      organizationId: order.organizationId,
      contactId: order.contactId,
      contactName: order.contact.displayName,
      orderNumber: order.orderNumber,
      status: order.status,
      issueDate: order.issueDate.toISOString(),
      expectedDate: order.expectedDate.toISOString(),
      currencyCode: order.currencyCode,
      subtotal: money(order.subtotal),
      taxTotal: money(order.taxTotal),
      total: money(order.total),
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      lines: order.lines.map((line) => ({
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

  async createOrder(
    organizationId: string,
    input: {
      contactId: string;
      orderNumber?: string | null;
      status: PurchaseOrderStatus;
      issueDate: string;
      expectedDate: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    await this.ensureSupplier(organizationId, input.contactId);
    const resolvedLines = await this.resolveLines(organizationId, input.lines);
    const totals = calculateDocumentLines(resolvedLines);
    const orderNumber =
      input.orderNumber?.trim() || (await this.nextOrderNumber(organizationId));

    const order = await this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        contactId: input.contactId,
        orderNumber,
        status: input.status,
        issueDate: new Date(input.issueDate),
        expectedDate: new Date(input.expectedDate),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: { create: toPersistedDocumentLinesWithoutInventory(totals.lines) }
      }
    });

    return this.getOrder(organizationId, order.id);
  }

  async updateOrder(
    organizationId: string,
    orderId: string,
    input: Partial<{
      contactId: string;
      orderNumber: string | null;
      status: PurchaseOrderStatus;
      issueDate: string;
      expectedDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Purchase order not found.");
    }

    this.ensurePurchaseOrderCanBeUpdated(existing, input);

    const contactId = input.contactId ?? existing.contactId;
    await this.ensureSupplier(organizationId, contactId);
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

    await this.prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        contactId,
        orderNumber: input.orderNumber?.trim() || existing.orderNumber,
        status: input.status ?? existing.status,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        expectedDate: input.expectedDate
          ? new Date(input.expectedDate)
          : existing.expectedDate,
        currencyCode: input.currencyCode?.toUpperCase() ?? existing.currencyCode,
        notes: input.notes === undefined ? existing.notes : input.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total
      }
    });

    if (input.lines) {
      await this.prisma.purchaseOrderLine.deleteMany({
        where: { purchaseOrderId: orderId }
      });
      await this.prisma.purchaseOrderLine.createMany({
        data: toPersistedDocumentLinesWithoutInventory(totals.lines).map((line) => ({
          purchaseOrderId: orderId,
          ...line
        }))
      });
    }

    return this.getOrder(organizationId, orderId);
  }

  async listRepeatingBills(
    organizationId: string,
    options: { status?: RecurringScheduleStatus; search?: string }
  ): Promise<RepeatingBillRecord[]> {
    const schedules = await this.prisma.repeatingBill.findMany({
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

  async getRepeatingBill(organizationId: string, repeatingBillId: string) {
    const schedules = await this.listRepeatingBills(organizationId, {});
    const schedule = schedules.find((entry) => entry.id === repeatingBillId);

    if (!schedule) {
      throw new NotFoundException("Repeating bill not found.");
    }

    return schedule;
  }

  async createRepeatingBill(
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
    await this.ensureSupplier(organizationId, input.contactId);
    const resolvedLines = await this.resolveLines(organizationId, input.lines);
    const totals = calculateDocumentLines(resolvedLines);

    const schedule = await this.prisma.repeatingBill.create({
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
        lines: { create: toPersistedDocumentLinesWithoutInventory(totals.lines) }
      }
    });

    return this.getRepeatingBill(organizationId, schedule.id);
  }

  async updateRepeatingBill(
    organizationId: string,
    repeatingBillId: string,
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
    const existing = await this.prisma.repeatingBill.findFirst({
      where: { id: repeatingBillId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Repeating bill not found.");
    }

    const contactId = input.contactId ?? existing.contactId;
    await this.ensureSupplier(organizationId, contactId);
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

    await this.prisma.repeatingBill.update({
      where: { id: repeatingBillId },
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
      await this.prisma.repeatingBillLine.deleteMany({
        where: { repeatingBillId }
      });
      await this.prisma.repeatingBillLine.createMany({
        data: toPersistedDocumentLinesWithoutInventory(totals.lines).map((line) => ({
          repeatingBillId,
          ...line
        }))
      });
    }

    return this.getRepeatingBill(organizationId, repeatingBillId);
  }

  async runRepeatingBill(
    organizationId: string,
    repeatingBillId: string,
    input?: { runAt?: string | null }
  ): Promise<{
    schedule: RepeatingBillRecord;
    bill: PurchaseBillDetail;
  }> {
    const runResult = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.repeatingBill.findFirst({
        where: { id: repeatingBillId, organizationId },
        include: { lines: true, contact: true }
      });

      if (!existing) {
        throw new NotFoundException("Repeating bill not found.");
      }

      if (existing.status !== "ACTIVE") {
        throw new BadRequestException("Only active repeating bills can be run.");
      }

      const runAt = input?.runAt ? new Date(input.runAt) : existing.nextRunAt;
      if (runAt.getTime() < existing.nextRunAt.getTime()) {
        throw new BadRequestException(
          "Repeating bills cannot run before the next scheduled date."
        );
      }

      const updateResult = await tx.repeatingBill.updateMany({
        where: {
          id: repeatingBillId,
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
          "This repeating bill was already run or updated. Refresh and try again."
        );
      }

      const dueDate = this.addDays(runAt, existing.contact.paymentTermsDays ?? 30);
      const bill = await this.purchasesService.createBillRecord(tx, organizationId, {
        contactId: existing.contactId,
        status: "APPROVED",
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
        billId: bill.id
      };
    });

    await this.purchasesService.refreshContactBalances(organizationId, runResult.contactId);

    return {
      schedule: await this.getRepeatingBill(organizationId, repeatingBillId),
      bill: await this.purchasesService.getBill(organizationId, runResult.billId)
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

  private async ensureSupplier(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, isSupplier: true }
    });

    if (!contact) {
      throw new NotFoundException("Supplier contact not found.");
    }
  }

  private async ensurePurchaseBill(
    organizationId: string,
    purchaseBillId: string | null,
    contactId?: string
  ) {
    if (!purchaseBillId) {
      return;
    }

    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: purchaseBillId, organizationId },
      select: {
        id: true,
        contactId: true
      }
    });

    if (!bill) {
      throw new NotFoundException("Purchase bill not found.");
    }

    if (contactId && bill.contactId !== contactId) {
      throw new BadRequestException(
        "Applied supplier credit notes must stay linked to the same supplier as the bill."
      );
    }
  }

  private async nextCreditNoteNumber(organizationId: string) {
    const count = await this.prisma.purchaseCreditNote.count({
      where: { organizationId }
    });

    return `PCN-${String(count + 1).padStart(4, "0")}`;
  }

  private async nextOrderNumber(organizationId: string) {
    const count = await this.prisma.purchaseOrder.count({
      where: { organizationId }
    });

    return `PO-${String(count + 1).padStart(4, "0")}`;
  }

  private ensurePurchaseCreditNoteCanBeUpdated(
    existing: {
      status: CreditNoteStatus;
    },
    input: Partial<{
      contactId: string;
      purchaseBillId: string | null;
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
        input.purchaseBillId !== undefined ||
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

  private async ensurePurchaseCreditApplicationAllowed(
    organizationId: string,
    purchaseBillId: string | null,
    status: CreditNoteStatus,
    excludeCreditNoteId: string | null,
    lines: DraftDocumentLine[]
  ) {
    if (status !== "APPLIED") {
      return;
    }

    if (!purchaseBillId) {
      throw new BadRequestException("Applied credit notes must be linked to a bill.");
    }

    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: purchaseBillId, organizationId },
      select: {
        total: true
      }
    });

    if (!bill) {
      throw new NotFoundException("Purchase bill not found.");
    }

    const nextTotal = Number(calculateDocumentLines(await this.resolveLines(organizationId, lines)).total);
    const appliedCredits = await this.prisma.purchaseCreditNote.aggregate({
      where: {
        organizationId,
        purchaseBillId,
        status: "APPLIED",
        ...(excludeCreditNoteId ? { id: { not: excludeCreditNoteId } } : {})
      },
      _sum: { total: true }
    });
    const appliedTotal = Number(appliedCredits._sum.total ?? 0) + nextTotal;

    if (appliedTotal > Number(bill.total) + 0.000001) {
      throw new BadRequestException(
        "Applied credit notes cannot exceed the bill total."
      );
    }
  }

  private ensurePurchaseOrderCanBeUpdated(
    existing: {
      status: PurchaseOrderStatus;
    },
    input: Partial<{
      contactId: string;
      orderNumber: string | null;
      status: PurchaseOrderStatus;
      issueDate: string;
      expectedDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    if (existing.status === "DRAFT") {
      return;
    }

    const changedStructure =
      input.contactId !== undefined ||
      input.orderNumber !== undefined ||
      input.issueDate !== undefined ||
      input.expectedDate !== undefined ||
      input.currencyCode !== undefined ||
      input.lines !== undefined;

    if (changedStructure) {
      throw new BadRequestException(
        "Sent purchase orders only allow status and note updates."
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
