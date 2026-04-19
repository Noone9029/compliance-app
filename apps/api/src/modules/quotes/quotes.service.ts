import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { QuoteDetail, QuoteStatus, QuoteSummary } from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import { mapStoredFileRecord } from "../files/file-record";
import {
  calculateDocumentLines,
  type DraftDocumentLine,
  toPersistedDocumentLines
} from "../sales/document-calculations";
import { resolveDocumentLines } from "../sales/document-line-resolution";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

@Injectable()
export class QuotesService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listQuotes(
    organizationId: string,
    options: {
      status?: QuoteStatus;
      search?: string;
      contactId?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<QuoteSummary[]> {
    const quotes = await this.prisma.quote.findMany({
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
                { quoteNumber: { contains: options.search, mode: "insensitive" } },
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

    return quotes.map((quote) => ({
      id: quote.id,
      organizationId: quote.organizationId,
      contactId: quote.contactId,
      contactName: quote.contact.displayName,
      contactEmail: quote.contact.email,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      expiryDate: quote.expiryDate.toISOString(),
      issueDate: quote.issueDate.toISOString(),
      currencyCode: quote.currencyCode,
      subtotal: money(quote.subtotal),
      taxTotal: money(quote.taxTotal),
      total: money(quote.total),
      convertedInvoiceId: quote.convertedInvoiceId,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString()
    }));
  }

  async getQuote(organizationId: string, quoteId: string): Promise<QuoteDetail> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: {
        contact: true,
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            inventoryItem: true
          }
        }
      }
    });

    if (!quote) {
      throw new NotFoundException("Quote not found.");
    }

    const attachments = await this.prisma.storedFile.findMany({
      where: {
        organizationId,
        relatedType: "quote",
        relatedId: quoteId
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      id: quote.id,
      organizationId: quote.organizationId,
      contactId: quote.contactId,
      contactName: quote.contact.displayName,
      contactEmail: quote.contact.email,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      expiryDate: quote.expiryDate.toISOString(),
      issueDate: quote.issueDate.toISOString(),
      currencyCode: quote.currencyCode,
      subtotal: money(quote.subtotal),
      taxTotal: money(quote.taxTotal),
      total: money(quote.total),
      convertedInvoiceId: quote.convertedInvoiceId,
      notes: quote.notes,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      lines: quote.lines.map((line) => ({
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
      attachments: attachments.map(mapStoredFileRecord)
    };
  }

  async createQuote(
    organizationId: string,
    input: {
      contactId: string;
      quoteNumber?: string | null;
      status: QuoteStatus;
      issueDate: string;
      expiryDate: string;
      currencyCode: string;
      notes?: string | null;
      lines: DraftDocumentLine[];
    }
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: input.contactId, organizationId, isCustomer: true }
    });

    if (!contact) {
      throw new NotFoundException("Customer contact not found.");
    }

    const resolvedLines = await resolveDocumentLines(
      this.prisma,
      organizationId,
      input.lines
    );
    const totals = calculateDocumentLines(resolvedLines);
    const quoteNumber =
      input.quoteNumber?.trim() || (await this.nextQuoteNumber(organizationId));

    const quote = await this.prisma.quote.create({
      data: {
        organizationId,
        contactId: input.contactId,
        quoteNumber,
        status: input.status,
        issueDate: new Date(input.issueDate),
        expiryDate: new Date(input.expiryDate),
        currencyCode: input.currencyCode.toUpperCase(),
        notes: input.notes ?? null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        lines: {
          create: toPersistedDocumentLines(totals.lines)
        }
      }
    });

    return this.getQuote(organizationId, quote.id);
  }

  async updateQuote(
    organizationId: string,
    quoteId: string,
    input: Partial<{
      contactId: string;
      quoteNumber: string | null;
      status: QuoteStatus;
      issueDate: string;
      expiryDate: string;
      currencyCode: string;
      notes: string | null;
      lines: DraftDocumentLine[];
    }>
  ) {
    const existing = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: { lines: true }
    });

    if (!existing) {
      throw new NotFoundException("Quote not found.");
    }

    if (existing.status === "CONVERTED") {
      throw new BadRequestException("Converted quotes can no longer be edited.");
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

    await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        contactId,
        quoteNumber: input.quoteNumber?.trim() || existing.quoteNumber,
        status: input.status ?? existing.status,
        issueDate: input.issueDate ? new Date(input.issueDate) : existing.issueDate,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : existing.expiryDate,
        currencyCode: input.currencyCode?.toUpperCase() ?? existing.currencyCode,
        notes: input.notes === undefined ? existing.notes : input.notes,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total
      }
    });

    if (input.lines) {
      await this.prisma.quoteLine.deleteMany({
        where: { quoteId }
      });

      await this.prisma.quoteLine.createMany({
        data: toPersistedDocumentLines(totals.lines).map((line) => ({
          quoteId,
          ...line
        }))
      });
    }

    return this.getQuote(organizationId, quoteId);
  }

  async convertQuote(organizationId: string, quoteId: string) {
    const existingQuote = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      select: { convertedInvoiceId: true }
    });

    if (!existingQuote) {
      throw new NotFoundException("Quote not found.");
    }

    if (existingQuote.convertedInvoiceId) {
      return {
        quote: await this.getQuote(organizationId, quoteId),
        invoiceId: existingQuote.convertedInvoiceId
      };
    }

    let invoiceId: string;

    try {
      invoiceId = await this.prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findFirst({
          where: { id: quoteId, organizationId },
          include: { lines: true, convertedInvoice: true }
        });

        if (!quote) {
          throw new NotFoundException("Quote not found.");
        }

        if (quote.convertedInvoiceId) {
          return quote.convertedInvoiceId;
        }

        const invoiceCount = await tx.salesInvoice.count({
          where: { organizationId }
        });
        const setting = await tx.organizationSetting.findUnique({
          where: {
            organizationId_key: {
              organizationId,
              key: "week2.invoice.settings"
            }
          }
        });
        const prefix =
          (setting?.value as { invoicePrefix?: string } | null)?.invoicePrefix ?? "INV";

        const invoice = await tx.salesInvoice.create({
          data: {
            organizationId,
            contactId: quote.contactId,
            invoiceNumber: `${prefix}-${String(invoiceCount + 1).padStart(4, "0")}`,
            status: "DRAFT",
            complianceInvoiceKind: "STANDARD",
            issueDate: quote.issueDate,
            dueDate: quote.expiryDate,
            currencyCode: quote.currencyCode,
            notes: quote.notes,
            subtotal: quote.subtotal,
            taxTotal: quote.taxTotal,
            total: quote.total,
            amountPaid: "0.00",
            amountDue: quote.total,
            lines: {
              create: quote.lines.map((line) => ({
                description: line.description,
                inventoryItemId: line.inventoryItemId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                taxRateId: line.taxRateId,
                taxRateName: line.taxRateName,
                taxRatePercent: line.taxRatePercent,
                lineSubtotal: line.lineSubtotal,
                lineTax: line.lineTax,
                lineTotal: line.lineTotal,
                sortOrder: line.sortOrder
              }))
            },
            statusEvents: {
              create: {
                action: "sales.invoice.created_from_quote",
                toStatus: "DRAFT",
                message: `Created from quote ${quote.quoteNumber}.`
              }
            }
          }
        });

        const converted = await tx.quote.updateMany({
          where: {
            id: quoteId,
            organizationId,
            convertedInvoiceId: null
          },
          data: {
            status: "CONVERTED",
            convertedInvoiceId: invoice.id
          }
        });

        if (converted.count !== 1) {
          throw new BadRequestException("Quote was already converted.");
        }

        return invoice.id;
      });
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message === "Quote was already converted."
      ) {
        const convertedQuote = await this.prisma.quote.findFirst({
          where: { id: quoteId, organizationId },
          select: { convertedInvoiceId: true }
        });

        if (convertedQuote?.convertedInvoiceId) {
          invoiceId = convertedQuote.convertedInvoiceId;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    await this.refreshContactBalances(organizationId, (
      await this.prisma.quote.findFirstOrThrow({
        where: { id: quoteId, organizationId },
        select: { contactId: true }
      })
    ).contactId);

    return {
      quote: await this.getQuote(organizationId, quoteId),
      invoiceId
    };
  }

  private async nextQuoteNumber(organizationId: string) {
    const count = await this.prisma.quote.count({
      where: { organizationId }
    });

    return `QUO-${String(count + 1).padStart(4, "0")}`;
  }

  private async refreshContactBalances(organizationId: string, contactId: string) {
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
