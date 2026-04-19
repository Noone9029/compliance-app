import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  ComplianceInvoiceKind,
  SalesInvoiceDetail,
  SalesInvoiceSummary,
  SalesInvoiceStatus
} from "@daftar/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { mapStoredFileRecord } from "../files/file-record";
import { canShareInvoiceWithCustomer } from "../compliance/compliance-core";
import {
  calculateDocumentLines,
  determineInvoiceStatus,
  type DraftDocumentLine,
  toPersistedDocumentLines
} from "./document-calculations";
import { resolveDocumentLines } from "./document-line-resolution";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SalesService {
  private readonly prisma: PrismaService;
  private readonly inventoryService: InventoryService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(InventoryService) inventoryService: InventoryService
  ) {
    this.prisma = prisma;
    this.inventoryService = inventoryService;
  }

  async listInvoices(
    organizationId: string,
    options: {
      status?: SalesInvoiceStatus;
      search?: string;
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<SalesInvoiceSummary[]> {
    const invoices = await this.prisma.salesInvoice.findMany({
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
                { invoiceNumber: { contains: options.search, mode: "insensitive" } },
                { contact: { displayName: { contains: options.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: {
        contact: true,
        complianceDocument: true
      },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }]
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      organizationId: invoice.organizationId,
      contactId: invoice.contactId,
      contactName: invoice.contact.displayName,
      contactEmail: invoice.contact.email,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      complianceInvoiceKind: invoice.complianceInvoiceKind,
      complianceStatus: invoice.complianceDocument?.status ?? null,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currencyCode: invoice.currencyCode,
      subtotal: money(invoice.subtotal),
      taxTotal: money(invoice.taxTotal),
      total: money(invoice.total),
      amountPaid: money(invoice.amountPaid),
      amountDue: money(invoice.amountDue),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString()
    }));
  }

  async getInvoice(
    organizationId: string,
    invoiceId: string
  ): Promise<SalesInvoiceDetail> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
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
        },
        statusEvents: {
          orderBy: { createdAt: "desc" }
        },
        complianceDocument: {
          include: {
            submission: {
              include: {
                attempts: {
                  orderBy: { startedAt: "desc" }
                }
              }
            },
            events: {
              orderBy: { createdAt: "desc" }
            }
          }
        }
      }
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    const attachments = await this.prisma.storedFile.findMany({
      where: {
        organizationId,
        relatedType: "sales-invoice",
        relatedId: invoiceId
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      contactId: invoice.contactId,
      contactName: invoice.contact.displayName,
      contactEmail: invoice.contact.email,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      complianceInvoiceKind: invoice.complianceInvoiceKind,
      complianceStatus: invoice.complianceDocument?.status ?? null,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      currencyCode: invoice.currencyCode,
      subtotal: money(invoice.subtotal),
      taxTotal: money(invoice.taxTotal),
      total: money(invoice.total),
      amountPaid: money(invoice.amountPaid),
      amountDue: money(invoice.amountDue),
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      lines: invoice.lines.map((line) => ({
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
      payments: invoice.payments.map((payment) => ({
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
      attachments: attachments.map(mapStoredFileRecord),
      statusEvents: invoice.statusEvents.map((event) => ({
        id: event.id,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        message: event.message,
        actorUserId: event.actorUserId,
        createdAt: event.createdAt.toISOString()
      })),
      compliance: invoice.complianceDocument
        ? {
            id: invoice.complianceDocument.id,
            salesInvoiceId: invoice.complianceDocument.salesInvoiceId,
            invoiceKind: invoice.complianceDocument.invoiceKind,
            submissionFlow: invoice.complianceDocument.submissionFlow,
            invoiceCounter: invoice.complianceDocument.invoiceCounter,
            uuid: invoice.complianceDocument.uuid,
            qrPayload: invoice.complianceDocument.qrPayload,
            previousHash: invoice.complianceDocument.previousHash,
            currentHash: invoice.complianceDocument.currentHash,
            xmlAvailable: Boolean(invoice.complianceDocument.xmlContent),
            status: invoice.complianceDocument.status,
            lastSubmissionStatus:
              invoice.complianceDocument.lastSubmissionStatus ?? null,
            lastSubmittedAt:
              invoice.complianceDocument.lastSubmittedAt?.toISOString() ?? null,
            lastError: invoice.complianceDocument.lastError,
            failureCategory: invoice.complianceDocument.failureCategory,
            externalSubmissionId:
              invoice.complianceDocument.externalSubmissionId ?? null,
            clearedAt:
              invoice.complianceDocument.clearedAt?.toISOString() ?? null,
            reportedAt:
              invoice.complianceDocument.reportedAt?.toISOString() ?? null,
            retryAllowed: Boolean(
              invoice.complianceDocument.submission &&
                invoice.complianceDocument.submission.attemptCount <
                  invoice.complianceDocument.submission.maxAttempts &&
                ["FAILED", "REJECTED"].includes(
                  invoice.complianceDocument.status
                )
            ),
            canShareWithCustomer: canShareInvoiceWithCustomer({
              invoiceKind: invoice.complianceDocument.invoiceKind,
              complianceStatus: invoice.complianceDocument.status,
              invoiceStatus: invoice.status
            }),
            submission: invoice.complianceDocument.submission
              ? {
                  id: invoice.complianceDocument.submission.id,
                  complianceDocumentId:
                    invoice.complianceDocument.submission.complianceDocumentId,
                  flow: invoice.complianceDocument.submission.flow,
                  status: invoice.complianceDocument.submission.status,
                  retryable: invoice.complianceDocument.submission.retryable,
                  attemptCount:
                    invoice.complianceDocument.submission.attemptCount,
                  maxAttempts: invoice.complianceDocument.submission.maxAttempts,
                  availableAt:
                    invoice.complianceDocument.submission.availableAt.toISOString(),
                  nextRetryAt:
                    invoice.complianceDocument.submission.nextRetryAt?.toISOString() ??
                    null,
                  lastAttemptAt:
                    invoice.complianceDocument.submission.lastAttemptAt?.toISOString() ??
                    null,
                  finishedAt:
                    invoice.complianceDocument.submission.finishedAt?.toISOString() ??
                    null,
                  failureCategory:
                    invoice.complianceDocument.submission.failureCategory ?? null,
                  externalSubmissionId:
                    invoice.complianceDocument.submission.externalSubmissionId ??
                    null,
                  errorMessage:
                    invoice.complianceDocument.submission.errorMessage ?? null,
                  createdAt:
                    invoice.complianceDocument.submission.createdAt.toISOString(),
                  updatedAt:
                    invoice.complianceDocument.submission.updatedAt.toISOString()
                }
              : null,
            attempts: invoice.complianceDocument.submission
              ? invoice.complianceDocument.submission.attempts.map((attempt) => ({
                  id: attempt.id,
                  complianceDocumentId: attempt.complianceDocumentId,
                  submissionId: attempt.zatcaSubmissionId,
                  attemptNumber: attempt.attemptNumber,
                  flow: attempt.flow,
                  status: attempt.status,
                  retryable: attempt.retryable,
                  endpoint: attempt.endpoint,
                  httpStatus: attempt.httpStatus,
                  failureCategory: attempt.failureCategory ?? null,
                  externalSubmissionId: attempt.externalSubmissionId ?? null,
                  errorMessage: attempt.errorMessage ?? null,
                  startedAt: attempt.startedAt.toISOString(),
                  finishedAt: attempt.finishedAt?.toISOString() ?? null
                }))
              : [],
            timeline: invoice.complianceDocument.events.map((event) => ({
              id: event.id,
              action: event.action,
              status: event.status,
              message: event.message,
              createdAt: event.createdAt.toISOString()
            })),
            createdAt: invoice.complianceDocument.createdAt.toISOString(),
            updatedAt: invoice.complianceDocument.updatedAt.toISOString()
          }
        : null
    };
  }

  async createInvoice(
    organizationId: string,
    userId: string,
    input: {
      contactId: string;
      invoiceNumber?: string | null;
      status: SalesInvoiceStatus;
      complianceInvoiceKind: ComplianceInvoiceKind;
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
        isCustomer: true
      }
    });

    if (!contact) {
      throw new NotFoundException("Customer contact not found.");
    }

    const resolvedLines = await resolveDocumentLines(
      this.prisma,
      organizationId,
      input.lines
    );
    const invoice = await this.prisma.$transaction((tx) =>
      this.createInvoiceRecord(tx, organizationId, userId, {
        ...input,
        resolvedLines
      })
    );

    await this.refreshContactBalances(organizationId, input.contactId);
    return this.getInvoice(organizationId, invoice.id);
  }

  async updateInvoice(
    organizationId: string,
    userId: string,
    invoiceId: string,
    input: Partial<{
      contactId: string;
      invoiceNumber: string | null;
      status: SalesInvoiceStatus;
      complianceInvoiceKind: ComplianceInvoiceKind;
      issueDate: string;
      dueDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        lines: true,
        payments: true,
        complianceDocument: {
          select: { id: true }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException("Invoice not found.");
    }

    if (existing.status !== "DRAFT" || existing.complianceDocument) {
      throw new BadRequestException(
        "Issued invoices can no longer be edited. Create a credit note or record a payment instead."
      );
    }

    const contactId = input.contactId ?? existing.contactId;
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, isCustomer: true }
    });

    if (!contact) {
      throw new NotFoundException("Customer contact not found.");
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
      determineInvoiceStatus({
        currentStatus: existing.status,
        amountPaid: amountPaid.toFixed(2),
        amountDue: amountDue.toFixed(2)
      });

    const nextInvoiceNumber = input.invoiceNumber?.trim() || existing.invoiceNumber;

    await this.prisma.$transaction(async (tx) => {
      await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          contactId,
          invoiceNumber: nextInvoiceNumber,
          status: nextStatus,
          complianceInvoiceKind:
            input.complianceInvoiceKind ?? existing.complianceInvoiceKind,
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
        await tx.salesInvoiceLine.deleteMany({
          where: { salesInvoiceId: invoiceId }
        });

        await tx.salesInvoiceLine.createMany({
          data: toPersistedDocumentLines(totals.lines).map((line) => ({
            salesInvoiceId: invoiceId,
            ...line
          }))
        });
      }

      await tx.invoiceStatusEvent.create({
        data: {
          salesInvoiceId: invoiceId,
          actorUserId: userId,
          action: "sales.invoice.updated",
          fromStatus: existing.status,
          toStatus: nextStatus,
          message: "Invoice updated."
        }
      });

      await this.inventoryService.syncSalesInvoiceInventory(
        {
          organizationId,
          invoiceId,
          invoiceNumber: nextInvoiceNumber,
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

    return this.getInvoice(organizationId, invoiceId);
  }

  async recordPayment(
    organizationId: string,
    userId: string,
    invoiceId: string,
    input: {
      bankAccountId: string;
      paymentDate: string;
      amount: string;
      method: string;
      reference?: string | null;
      notes?: string | null;
    }
  ) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { payments: true, lines: true }
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    if (invoice.status === "DRAFT" || invoice.status === "VOID") {
      throw new BadRequestException("Only issued invoices can accept payments.");
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero.");
    }

    await this.ensureActiveBankAccount(organizationId, input.bankAccountId);

    const appliedCredits = await this.prisma.salesCreditNote.aggregate({
      where: {
        organizationId,
        salesInvoiceId: invoiceId,
        status: "APPLIED"
      },
      _sum: { total: true }
    });
    const amountPaidBefore = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    const creditApplied = Number(appliedCredits._sum.total ?? 0);
    const remainingBalance = Number(invoice.total) - amountPaidBefore - creditApplied;

    if (amount > remainingBalance + 0.000001) {
      throw new BadRequestException("Payment exceeds the remaining invoice balance.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoicePayment.create({
        data: {
          salesInvoiceId: invoiceId,
          bankAccountId: input.bankAccountId,
          paymentDate: new Date(input.paymentDate),
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null
        }
      });

      const refreshed = await this.recalculateInvoiceBalance(tx, organizationId, invoiceId);

      await tx.invoiceStatusEvent.create({
        data: {
          salesInvoiceId: invoiceId,
          actorUserId: userId,
          action: "sales.invoice.payment_recorded",
          fromStatus: invoice.status,
          toStatus: refreshed.status,
          message: `Payment recorded via ${input.method}.`
        }
      });

      await this.inventoryService.syncSalesInvoiceInventory(
        {
          organizationId,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          status: refreshed.status,
          lines: invoice.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity.toString(),
            description: line.description
          }))
        },
        tx
      );
    });

    await this.refreshContactBalances(organizationId, invoice.contactId);
    return this.getInvoice(organizationId, invoiceId);
  }

  async createInvoiceRecord(
    client: PrismaClientLike,
    organizationId: string,
    userId: string | null,
    input: {
      contactId: string;
      invoiceNumber?: string | null;
      status: SalesInvoiceStatus;
      complianceInvoiceKind: ComplianceInvoiceKind;
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
        isCustomer: true
      }
    });

    if (!contact) {
      throw new NotFoundException("Customer contact not found.");
    }

    const totals = calculateDocumentLines(input.resolvedLines);
    const invoiceNumber =
      input.invoiceNumber?.trim() ||
      (await this.nextInvoiceNumber(organizationId, client));

    const createdInvoice = await client.salesInvoice.create({
      data: {
        organizationId,
        contactId: input.contactId,
        invoiceNumber,
        status: input.status,
        complianceInvoiceKind: input.complianceInvoiceKind,
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
        },
        statusEvents: {
          create: {
            actorUserId: userId,
            action: "sales.invoice.created",
            toStatus: input.status,
            message: "Invoice created."
          }
        }
      }
    });

    await this.inventoryService.syncSalesInvoiceInventory(
      {
        organizationId,
        invoiceId: createdInvoice.id,
        invoiceNumber,
        status: input.status,
        lines: totals.lines
      },
      client
    );

    return createdInvoice;
  }

  async refreshInvoiceFinancials(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { contactId: true }
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    await this.prisma.$transaction((tx) =>
      this.recalculateInvoiceBalance(tx, organizationId, invoiceId)
    );
    await this.refreshContactBalances(organizationId, invoice.contactId);
  }

  private async nextInvoiceNumber(
    organizationId: string,
    client: PrismaClientLike = this.prisma
  ) {
    const setting = await client.organizationSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: "week2.invoice.settings"
        }
      }
    });

    const prefix =
      (setting?.value as { invoicePrefix?: string } | null)?.invoicePrefix ?? "INV";
    const count = await client.salesInvoice.count({
      where: { organizationId }
    });

    return `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }

  private async recalculateInvoiceBalance(
    client: PrismaClientLike,
    organizationId: string,
    invoiceId: string
  ): Promise<{ status: SalesInvoiceStatus }> {
    const invoice = await client.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        payments: true,
        creditNotes: {
          where: { status: "APPLIED" },
          select: { total: true }
        }
      }
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    const amountPaid = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    const creditApplied = invoice.creditNotes.reduce(
      (sum, creditNote) => sum + Number(creditNote.total),
      0
    );
    const amountDue = Math.max(Number(invoice.total) - amountPaid - creditApplied, 0);
    const status = determineInvoiceStatus({
      currentStatus: invoice.status,
      amountPaid: amountPaid.toFixed(2),
      amountDue: amountDue.toFixed(2)
    });

    await client.salesInvoice.update({
      where: { id: invoiceId },
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
