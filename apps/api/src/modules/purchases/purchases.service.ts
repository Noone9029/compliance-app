import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  PurchaseBillDetail,
  PurchaseBillStatus,
  PurchaseBillSummary
} from "@daftar/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { mapStoredFileRecord } from "../files/file-record";
import { InventoryService } from "../inventory/inventory.service";
import {
  calculateDocumentLines,
  determineBillStatus,
  type DraftDocumentLine,
  toPersistedDocumentLines
} from "../sales/document-calculations";
import { resolveDocumentLines } from "../sales/document-line-resolution";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PurchasesService {
  private readonly prisma: PrismaService;
  private readonly inventoryService: InventoryService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(InventoryService) inventoryService: InventoryService
  ) {
    this.prisma = prisma;
    this.inventoryService = inventoryService;
  }

  async listBills(
    organizationId: string,
    options: {
      status?: PurchaseBillStatus;
      search?: string;
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<PurchaseBillSummary[]> {
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        organizationId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.contactId ? { contactId: options.contactId } : {}),
        ...(options.dateFrom || options.dateTo
          ? {
              issueDate: {
                ...(options.dateFrom ? { gte: new Date(options.dateFrom) } : {}),
                ...(options.dateTo ? { lte: new Date(options.dateTo) } : {})
              }
            }
          : {}),
        ...(options.search
          ? {
              OR: [
                { billNumber: { contains: options.search, mode: "insensitive" } },
                { contact: { displayName: { contains: options.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: {
        contact: true
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    return bills.map((bill) => ({
      id: bill.id,
      organizationId: bill.organizationId,
      contactId: bill.contactId,
      contactName: bill.contact.displayName,
      contactEmail: bill.contact.email,
      billNumber: bill.billNumber,
      status: bill.status,
      issueDate: bill.issueDate.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      currencyCode: bill.currencyCode,
      subtotal: money(bill.subtotal),
      taxTotal: money(bill.taxTotal),
      total: money(bill.total),
      amountPaid: money(bill.amountPaid),
      amountDue: money(bill.amountDue),
      createdAt: bill.createdAt.toISOString(),
      updatedAt: bill.updatedAt.toISOString()
    }));
  }

  async getBill(
    organizationId: string,
    billId: string
  ): Promise<PurchaseBillDetail> {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, organizationId },
      include: {
        contact: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            inventoryItem: true
          }
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            bankAccount: true
          }
        }
      }
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    const attachments = await this.prisma.storedFile.findMany({
      where: {
        organizationId,
        relatedType: "purchase-bill",
        relatedId: billId
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      id: bill.id,
      organizationId: bill.organizationId,
      contactId: bill.contactId,
      contactName: bill.contact.displayName,
      contactEmail: bill.contact.email,
      billNumber: bill.billNumber,
      status: bill.status,
      issueDate: bill.issueDate.toISOString(),
      dueDate: bill.dueDate.toISOString(),
      currencyCode: bill.currencyCode,
      subtotal: money(bill.subtotal),
      taxTotal: money(bill.taxTotal),
      total: money(bill.total),
      amountPaid: money(bill.amountPaid),
      amountDue: money(bill.amountDue),
      notes: bill.notes,
      createdAt: bill.createdAt.toISOString(),
      updatedAt: bill.updatedAt.toISOString(),
      lines: bill.lines.map((line) => ({
        id: line.id,
        description: line.description,
        inventoryItemId: line.inventoryItemId,
        inventoryItemCode: line.inventoryItem?.itemCode ?? null,
        inventoryItemName: line.inventoryItem?.itemName ?? null,
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
      payments: bill.payments.map((payment) => ({
        id: payment.id,
        bankAccountId: payment.bankAccountId,
        bankAccountName: payment.bankAccount?.name ?? null,
        paymentDate: payment.paymentDate.toISOString(),
        amount: money(payment.amount),
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        createdAt: payment.createdAt.toISOString()
      })),
      attachments: attachments.map(mapStoredFileRecord)
    };
  }

  async createBill(
    organizationId: string,
    input: {
      contactId: string;
      billNumber?: string | null;
      status: PurchaseBillStatus;
      issueDate: string;
      dueDate: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: input.contactId,
        organizationId,
        isSupplier: true
      }
    });

    if (!contact) {
      throw new NotFoundException("Supplier contact not found.");
    }

    const resolvedLines = await resolveDocumentLines(
      this.prisma,
      organizationId,
      input.lines
    );
    const bill = await this.prisma.$transaction((tx) =>
      this.createBillRecord(tx, organizationId, {
        ...input,
        resolvedLines
      })
    );

    await this.refreshContactBalances(organizationId, input.contactId);
    return this.getBill(organizationId, bill.id);
  }

  async updateBill(
    organizationId: string,
    billId: string,
    input: Partial<{
      contactId: string;
      billNumber: string | null;
      status: PurchaseBillStatus;
      issueDate: string;
      dueDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, organizationId },
      include: { lines: true, payments: true }
    });

    if (!existing) {
      throw new NotFoundException("Bill not found.");
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException(
        "Approved bills can no longer be edited. Record a payment or issue a credit note instead."
      );
    }

    const contactId = input.contactId ?? existing.contactId;
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, isSupplier: true }
    });

    if (!contact) {
      throw new NotFoundException("Supplier contact not found.");
    }

    const sourceLines =
      input.lines ??
      existing.lines.map((line) => ({
        description: line.description,
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        taxRateId: line.taxRateId,
        taxRateName: line.taxRateName,
        taxRatePercent: line.taxRatePercent.toString()
      }));

    const resolvedLines = await resolveDocumentLines(
      this.prisma,
      organizationId,
      sourceLines
    );
    const totals = calculateDocumentLines(resolvedLines);
    const amountPaid = existing.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    const amountDue = Number(totals.total) - amountPaid;
    const nextStatus =
      input.status ??
      determineBillStatus({
        currentStatus: existing.status,
        amountPaid: amountPaid.toFixed(2),
        amountDue: amountDue.toFixed(2)
      });

    const nextBillNumber = input.billNumber?.trim() || existing.billNumber;

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseBill.update({
        where: { id: billId },
        data: {
          contactId,
          billNumber: nextBillNumber,
          status: nextStatus,
          issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
          dueDate: input.dueDate ? new Date(input.dueDate) : existing.dueDate,
          currencyCode: input.currencyCode?.toUpperCase() ?? existing.currencyCode,
          notes: input.notes === undefined ? existing.notes : input.notes,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
          amountPaid: amountPaid.toFixed(2),
          amountDue: amountDue.toFixed(2)
        }
      });

      if (input.lines) {
        await tx.purchaseBillLine.deleteMany({
          where: { purchaseBillId: billId }
        });

        await tx.purchaseBillLine.createMany({
          data: toPersistedDocumentLines(totals.lines).map((line) => ({
            purchaseBillId: billId,
            ...line
          }))
        });
      }

      await this.inventoryService.syncPurchaseBillInventory(
        {
          organizationId,
          billId,
          billNumber: nextBillNumber,
          status: nextStatus,
          lines: totals.lines
        },
        tx
      );
    });

    await this.refreshContactBalances(organizationId, existing.contactId);
    if (contactId !== existing.contactId) {
      await this.refreshContactBalances(organizationId, contactId);
    }

    return this.getBill(organizationId, billId);
  }

  async recordPayment(
    organizationId: string,
    billId: string,
    input: {
      bankAccountId: string;
      paymentDate: string;
      amount: string;
      method: string;
      reference?: string | null;
      notes?: string | null;
    }
  ) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, organizationId },
      include: { payments: true, lines: true }
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    if (bill.status === "DRAFT" || bill.status === "VOID") {
      throw new BadRequestException("Only approved bills can accept payments.");
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    await this.ensureActiveBankAccount(organizationId, input.bankAccountId);

    const appliedCredits = await this.prisma.purchaseCreditNote.aggregate({
      where: {
        organizationId,
        purchaseBillId: billId,
        status: "APPLIED"
      },
      _sum: { total: true }
    });
    const amountPaidBefore = bill.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    const creditApplied = Number(appliedCredits._sum.total ?? 0);
    const remainingBalance = Number(bill.total) - amountPaidBefore - creditApplied;

    if (amount > remainingBalance + 0.000001) {
      throw new BadRequestException("Payment exceeds the remaining bill balance.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billPayment.create({
        data: {
          purchaseBillId: billId,
          bankAccountId: input.bankAccountId,
          paymentDate: new Date(input.paymentDate),
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null
        }
      });

      const refreshed = await this.recalculateBillBalance(tx, organizationId, billId);

      await this.inventoryService.syncPurchaseBillInventory(
        {
          organizationId,
          billId,
          billNumber: bill.billNumber,
          status: refreshed.status,
          lines: bill.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity.toString(),
            description: line.description
          }))
        },
        tx
      );
    });

    await this.refreshContactBalances(organizationId, bill.contactId);
    return this.getBill(organizationId, billId);
  }

  async createBillRecord(
    client: PrismaClientLike,
    organizationId: string,
    input: {
      contactId: string;
      billNumber?: string | null;
      status: PurchaseBillStatus;
      issueDate: string;
      dueDate: string;
      currencyCode: string;
      notes?: string | null;
      resolvedLines: Awaited<ReturnType<typeof resolveDocumentLines>>;
    }
  ) {
    const contact = await client.contact.findFirst({
      where: {
        id: input.contactId,
        organizationId,
        isSupplier: true
      }
    });

    if (!contact) {
      throw new NotFoundException("Supplier contact not found.");
    }

    const totals = calculateDocumentLines(input.resolvedLines);
    const billNumber =
      input.billNumber?.trim() || (await this.nextBillNumber(organizationId, client));

    const createdBill = await client.purchaseBill.create({
      data: {
        organizationId,
        contactId: input.contactId,
        billNumber,
        status: input.status,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        amountPaid: "0.00",
        amountDue: totals.total,
        lines: {
          create: toPersistedDocumentLines(totals.lines)
        }
      }
    });

    await this.inventoryService.syncPurchaseBillInventory(
      {
        organizationId,
        billId: createdBill.id,
        billNumber,
        status: input.status,
        lines: totals.lines
      },
      client
    );

    return createdBill;
  }

  async refreshBillFinancials(organizationId: string, billId: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, organizationId },
      select: { contactId: true }
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    await this.prisma.$transaction((tx) =>
      this.recalculateBillBalance(tx, organizationId, billId)
    );
    await this.refreshContactBalances(organizationId, bill.contactId);
  }

  private async nextBillNumber(
    organizationId: string,
    client: PrismaClientLike = this.prisma
  ) {
    const count = await client.purchaseBill.count({
      where: { organizationId }
    });

    return `BILL-${String(count + 1).padStart(4, "0")}`;
  }

  private async recalculateBillBalance(
    client: PrismaClientLike,
    organizationId: string,
    billId: string
  ): Promise<{ status: PurchaseBillStatus }> {
    const bill = await client.purchaseBill.findFirst({
      where: { id: billId, organizationId },
      include: {
        payments: true,
        creditNotes: {
          where: { status: "APPLIED" },
          select: { total: true }
        }
      }
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    const amountPaid = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const creditApplied = bill.creditNotes.reduce(
      (sum, creditNote) => sum + Number(creditNote.total),
      0
    );
    const amountDue = Math.max(Number(bill.total) - amountPaid - creditApplied, 0);
    const status = determineBillStatus({
      currentStatus: bill.status,
      amountPaid: amountPaid.toFixed(2),
      amountDue: amountDue.toFixed(2)
    });

    await client.purchaseBill.update({
      where: { id: billId },
      data: {
        amountPaid: amountPaid.toFixed(2),
        amountDue: amountDue.toFixed(2),
        status
      }
    });

    return {
      status
    };
  }

  private async ensureActiveBankAccount(organizationId: string, bankAccountId: string) {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        organizationId,
        isActive: true
      }
    });

    if (!bankAccount) {
      throw new NotFoundException("Active bank account not found.");
    }
  }

  async refreshContactBalances(organizationId: string, contactId: string) {
    const sales = await this.prisma.salesInvoice.aggregate({
      where: { organizationId, contactId, status: { not: "VOID" } },
      _sum: { amountDue: true }
    });
    const bills = await this.prisma.purchaseBill.aggregate({
      where: { organizationId, contactId, status: { not: "VOID" } },
      _sum: { amountDue: true }
    });

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        receivableBalance: money(sales._sum.amountDue),
        payableBalance: money(bills._sum.amountDue)
      }
    });
  }
}
