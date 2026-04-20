import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConnectorProvider } from "@daftar/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SalesInvoiceStatus } from "@prisma/client";
import { createHash, randomUUID } from "crypto";

import { XeroAdapter } from "./xero.adapter";
import { QuickBooksAdapter } from "./quickbooks.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";

import { QuickBooksTransport } from "./quickbooks.transport";
import { QuickBooksApiClient } from "./quickbooks.api";

import {
  createConnectorNonce,
  decodeConnectorState,
  encodeConnectorState
} from "./connector-state";

import type {
  ConnectorProviderTransport
} from "./provider-transport";

import type {
  ConnectorAdapter,
  CanonicalImportBundle
} from "./connector-adapter";

@Injectable()
export class ConnectorsService {
  private readonly adapters: Map<string, ConnectorAdapter>;
  private readonly transports: Map<string, ConnectorProviderTransport>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,

    @Inject(XeroAdapter) xeroAdapter: XeroAdapter,
    @Inject(QuickBooksAdapter) quickBooksAdapter: QuickBooksAdapter,
    @Inject(ZohoBooksAdapter) zohoBooksAdapter: ZohoBooksAdapter,

    @Inject(QuickBooksTransport) quickBooksTransport: QuickBooksTransport,
    @Inject(QuickBooksApiClient)
    private readonly quickBooksApiClient: QuickBooksApiClient
  ) {
    const adapterEntries: Array<[string, ConnectorAdapter]> = [
      [xeroAdapter.provider, xeroAdapter],
      [quickBooksAdapter.provider, quickBooksAdapter],
      [zohoBooksAdapter.provider, zohoBooksAdapter]
    ];

    this.adapters = new Map(adapterEntries);

    const transportEntries: Array<[string, ConnectorProviderTransport]> = [
      [quickBooksTransport.provider, quickBooksTransport]
    ];

    this.transports = new Map(transportEntries);
  }

  /* =========================
     CONNECT FLOW
  ========================= */

  async getConnectUrl(input: {
    organizationId: string;
    userId: string;
    provider: ConnectorProvider;
    redirectUri: string;
  }) {
    const transport = this.getTransport(input.provider);

    const state = encodeConnectorState({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      nonce: createConnectorNonce()
    });

    return transport.buildAuthorizationUrl({
      organizationId: input.organizationId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      state
    });
  }

  async completeConnection(input: {
    organizationId: string;
    userId: string;
    provider: ConnectorProvider;
    code: string;
    state: string;
    redirectUri: string;
    externalTenantId?: string | null;
  }) {
    const decoded = decodeConnectorState(input.state);

    if (
      decoded.organizationId !== input.organizationId ||
      decoded.userId !== input.userId ||
      decoded.provider !== input.provider
    ) {
      throw new BadRequestException("Invalid connector state");
    }

    const transport = this.getTransport(input.provider);

    const tokens = await transport.exchangeAuthorizationCode({
      organizationId: input.organizationId,
      userId: input.userId,
      code: input.code,
      redirectUri: input.redirectUri
    });

    const account = await this.prisma.connectorAccount.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: input.provider
        }
      },
      update: {
        status: "CONNECTED",
        displayName: tokens.displayName ?? input.provider,
        externalTenantId: tokens.externalTenantId,
        connectedByUserId: input.userId,
        connectedAt: new Date(),
        metadata: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          raw: tokens.raw
        } as Prisma.InputJsonValue,
        scopes: tokens.scopes as Prisma.InputJsonValue
      },
      create: {
        organizationId: input.organizationId,
        provider: input.provider,
        status: "CONNECTED",
        displayName: tokens.displayName ?? input.provider,
        externalTenantId: tokens.externalTenantId,
        connectedByUserId: input.userId,
        connectedAt: new Date(),
        metadata: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          raw: tokens.raw
        } as Prisma.InputJsonValue,
        scopes: tokens.scopes as Prisma.InputJsonValue
      }
    });

    return account;
  }

  /* =========================
     LISTING
  ========================= */

  async listAccounts(organizationId: string) {
    return this.prisma.connectorAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" }
    });
  }

  async listLogs(organizationId: string, connectorAccountId?: string) {
    return this.prisma.connectorSyncLog.findMany({
      where: {
        organizationId,
        ...(connectorAccountId ? { connectorAccountId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /* =========================
     SYNC ENTRY POINT
  ========================= */

  async runSync(
    organizationId: string,
    connectorAccountId: string,
    input: {
      direction: "IMPORT" | "EXPORT";
      scope?: string | null;
    }
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    if (input.direction === "IMPORT") {
      if (account.provider === "QUICKBOOKS_ONLINE") {
        return this.runQuickBooksImport(organizationId, account.id);
      }

      return this.runBootstrapImport(organizationId, account.id);
    }

    return this.runExportPreview(
      organizationId,
      account.id,
      input.scope ?? null
    );
  }

  /* =========================
     QUICKBOOKS LIVE IMPORT
  ========================= */

  private async runQuickBooksImport(
    organizationId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    if (account.provider !== "QUICKBOOKS_ONLINE") {
      throw new Error("runQuickBooksImport called for non-QuickBooks connector");
    }

    const startedAt = new Date();

    try {
      const [customers, invoices] = await Promise.all([
        this.quickBooksApiClient.listCustomers(connectorAccountId),
        this.quickBooksApiClient.listInvoices(connectorAccountId)
      ]);

      const bundle = (adapter as QuickBooksAdapter).mapLiveImportPayload({
        customers,
        invoices
      });

      const summary = await this.persistCanonicalImportBundle(
        organizationId,
        connectorAccountId,
        bundle
      );
      const complianceDocsCreated =
      await this.createComplianceDocumentsForInvoices(
        organizationId,
        connectorAccountId
      );

      const xmlGenerated =
      await this.generateXmlForComplianceDocuments(
        organizationId,
        connectorAccountId
      );

      await this.prisma.connectorAccount.update({
        where: { id: connectorAccountId },
        data: {
          lastSyncedAt: new Date()
        }
      });

      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "SUCCESS",
          retryable: false,
          startedAt: new Date(),
          finishedAt: new Date(),
          metadata: {
            mode: "quickbooks-live",
            customersFetched: customers.length,
            invoicesFetched: invoices.length,
            contactsPersisted: summary.contacts,
            invoicesPrepared: summary.invoices
          } as Prisma.InputJsonValue
        }
      });

      return {
        ok: true,
        mode: "quickbooks-live",
        organizationId,
        connectorAccountId,
        imported: {
          contacts: summary.contacts,
          invoices: summary.invoices
        },
        complianceDocumentsCreated: complianceDocsCreated,
        xmlGenerated,
        log
      };

    } catch (error) {
      const message =
        error instanceof Error ? error.message : "QuickBooks import failed";

      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "FAILED",
          retryable: true,
          message,
          startedAt,
          finishedAt: new Date(),
          metadata: {
            mode: "quickbooks-live"
          } as Prisma.InputJsonValue
        }
      });

      return {
        ok: false,
        mode: "quickbooks-live",
        organizationId,
        connectorAccountId,
        message,
        log
      };
    }
  }

  /* =========================
     BOOTSTRAP (fallback)
  ========================= */

  private async runBootstrapImport(
    organizationId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        slug: true
      }
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: organization.name.trim() || organization.slug.trim(),
      defaultCurrencyCode: "SAR"
    });

    const bundle = adapter.mapBootstrapImportPayload(payload);

    const summary = await this.persistCanonicalImportBundle(
      organizationId,
      connectorAccountId,
      bundle
    );

    const complianceDocsCreated =
      await this.createComplianceDocumentsForInvoices(
        organizationId,
        connectorAccountId
      );
    
    const xmlGenerated =
      await this.generateXmlForComplianceDocuments(
        organizationId,
        connectorAccountId
      );

    return {
      ok: true,
      mode: "bootstrap",
      organizationId,
      connectorAccountId,
      imported: {
        contacts: summary.contacts,
        invoices: summary.invoices
      },
      complianceDocumentsCreated: complianceDocsCreated,
      xmlGenerated
    };
  }

  async getExportPreview(
    organizationId: string,
    connectorAccountId: string
  ) {
    return this.runExportPreview(organizationId, connectorAccountId, null);
  }

  /* =========================
     EXPORT PREVIEW
  ========================= */

  private async runExportPreview(
    organizationId: string,
    connectorAccountId: string,
    scope: string | null
  ) {
    return {
      organizationId,
      connectorAccountId,
      scope,
      message: "Export preview not implemented yet"
    };
  }

  /* =========================
     PERSIST
  ========================= */

  private async persistCanonicalImportBundle(
    organizationId: string,
    connectorAccountId: string,
    bundle: CanonicalImportBundle
  ) {
    const contactIdsByExternalId = new Map<string, string>();
    let persistedContacts = 0;

    for (const contact of bundle.contacts) {
      const contactId = await this.upsertImportedContact(
        organizationId,
        connectorAccountId,
        contact
      );

      if (contact.externalId) {
        contactIdsByExternalId.set(contact.externalId, contactId);
      }

      persistedContacts += 1;
    }

    const persistedInvoices = await this.persistCanonicalInvoices(
      organizationId,
      connectorAccountId,
      bundle.invoices,
      contactIdsByExternalId
    );

    return {
      contacts: persistedContacts,
      invoices: persistedInvoices
    };
  }

  /* =========================
     HELPERS
  ========================= */


  private mapImportedInvoiceStatus(
    sourceStatus: string,
    balance: number,
    total: number
  ):  SalesInvoiceStatus {
    const normalized = sourceStatus.trim().toUpperCase();

    if (normalized === "PAID") {
      return "PAID";
    }

    if (normalized === "VOID" || normalized === "VOIDED") {
      return "VOID";
    }

    if (Number(balance) <= 0 && Number(total) > 0) {
      return "PAID";
    }

    if (Number(balance) > 0 && Number(balance) < Number(total)) {
      return "PARTIALLY_PAID";
    }

    if (normalized === "DRAFT") {
      return "DRAFT";
    }

    return "ISSUED";
  }

  private async findMatchingTaxRate(
    organizationId: string,
    code: string | null,
    rate: number | null
  ) {
    if (code) {
      const byCode = await this.prisma.taxRate.findFirst({
        where: {
          organizationId,
          code
        }
      });

      if (byCode) {
        return byCode;
      }
    }

    if (typeof rate === "number") {
      const byRate = await this.prisma.taxRate.findFirst({
        where: {
          organizationId,
          rate: this.toMoney(rate)
        }
      });

      if (byRate) {
        return byRate;
      }
    }

    return null;
  }

  private toMoney(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private async resolveImportedInvoiceContact(
    organizationId: string,
    connectorAccountId: string,
    invoice: CanonicalImportBundle["invoices"][number],
    contactIdsByExternalId: Map<string, string>
  ) {
    if (invoice.contactExternalId) {
      const mapped = contactIdsByExternalId.get(invoice.contactExternalId);
      if (mapped) {
        return mapped;
      }
    }

    const byName = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        displayName: invoice.contactDisplayName
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (byName) {
      return byName.id;
    }

    const created = await this.prisma.contact.create({
      data: {
        organizationId,
        displayName: invoice.contactDisplayName,
        companyName: invoice.contactDisplayName,
        isCustomer: true,
        isSupplier: false,
        notes: `Auto-created from imported invoice via connector ${connectorAccountId}`
      }
    });

    if (invoice.contactExternalId) {
      contactIdsByExternalId.set(invoice.contactExternalId, created.id);
    }

    return created.id;
  }

  private async generateXmlForComplianceDocuments(
    organizationId: string,
    connectorAccountId: string
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        taxDetail: true
      }
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    const docs = await this.prisma.complianceDocument.findMany({
      where: {
        organizationId,
        status: "DRAFT",
        salesInvoice: {
          sourceConnectorAccountId: connectorAccountId
        }
      },
      include: {
        salesInvoice: {
          include: {
            contact: {
              include: {
                addresses: true
              }
            },
            lines: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let generated = 0;

    for (const doc of docs) {
      const qrPayload = this.buildQrPayload({
        sellerName:
          organization.taxDetail?.legalName?.trim() ||
          organization.name.trim(),
        vatNumber: organization.taxDetail?.taxNumber?.trim() || "",
        timestamp: doc.salesInvoice.issueDate,
        invoiceTotal: Number(doc.salesInvoice.total),
        vatTotal: Number(doc.salesInvoice.taxTotal)
      });

      const xml = this.generateInvoiceXml(
        organization,
        doc.salesInvoice,
        doc,
        qrPayload
      );

      await this.prisma.complianceDocument.update({
        where: { id: doc.id },
        data: {
          qrPayload,
          xmlContent: xml,
          status: "READY"
        }
      });

      generated++;
    }

    return generated;
  }

  private generateInvoiceXml(
    organization: {
      name: string;
      taxDetail: {
        legalName: string;
        taxNumber: string;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        postalCode: string | null;
        countryCode: string;
        registrationNumber: string | null;
      } | null;
    },
    invoice: {
      invoiceNumber: string;
      issueDate: Date;
      dueDate: Date;
      currencyCode: string;
      notes: string | null;
      subtotal: Prisma.Decimal;
      taxTotal: Prisma.Decimal;
      total: Prisma.Decimal;
      amountPaid: Prisma.Decimal;
      amountDue: Prisma.Decimal;
      complianceInvoiceKind: "STANDARD" | "SIMPLIFIED";
      contact: {
        displayName: string;
        companyName: string | null;
        taxNumber: string | null;
        addresses: Array<{
          line1: string;
          line2: string | null;
          city: string | null;
          postalCode: string | null;
          countryCode: string;
        }>;
      };
      lines: Array<{
        id: string;
        description: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        lineSubtotal: Prisma.Decimal;
        lineTax: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
        taxRatePercent: Prisma.Decimal;
        taxRateName: string | null;
      }>;
    },
    doc: {
      uuid: string;
      previousHash: string | null;
      currentHash: string;
    },
    qrPayload: string
  ) {
    const sellerName =
      organization.taxDetail?.legalName?.trim() ||
      organization.name.trim();

    const sellerVat = organization.taxDetail?.taxNumber?.trim() || "";
    const sellerAddress1 = organization.taxDetail?.addressLine1?.trim() || "";
    const sellerAddress2 = organization.taxDetail?.addressLine2?.trim() || "";
    const sellerCity = organization.taxDetail?.city?.trim() || "";
    const sellerPostal = organization.taxDetail?.postalCode?.trim() || "";
    const sellerCountry = organization.taxDetail?.countryCode?.trim() || "SA";
    const sellerRegistration =
      organization.taxDetail?.registrationNumber?.trim() || "";

    const buyerAddress = invoice.contact.addresses[0];
    const buyerName =
      invoice.contact.companyName?.trim() || invoice.contact.displayName.trim();
    const buyerVat = invoice.contact.taxNumber?.trim() || "";
    const buyerAddress1 = buyerAddress?.line1?.trim() || "";
    const buyerAddress2 = buyerAddress?.line2?.trim() || "";
    const buyerCity = buyerAddress?.city?.trim() || "";
    const buyerPostal = buyerAddress?.postalCode?.trim() || "";
    const buyerCountry = buyerAddress?.countryCode?.trim() || "SA";

    const issueDate = this.formatDate(invoice.issueDate);
    const issueTime = this.formatTime(invoice.issueDate);
    const dueDate = this.formatDate(invoice.dueDate);

    const invoiceTypeCode =
      invoice.complianceInvoiceKind === "SIMPLIFIED" ? "0200000" : "0100000";

    const lineXml = invoice.lines
      .map((line, index) => {
        const quantity = this.formatDecimal(line.quantity);
        const unitPrice = this.formatDecimal(line.unitPrice);
        const lineSubtotal = this.formatDecimal(line.lineSubtotal);
        const lineTax = this.formatDecimal(line.lineTax);
        const lineTotal = this.formatDecimal(line.lineTotal);
        const taxPercent = this.formatDecimal(line.taxRatePercent);

        return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${lineSubtotal}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${lineTax}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${lineTotal}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${this.escapeXml(line.description || "Item")}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${taxPercent}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${unitPrice}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`.trim();
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
  <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
          xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
          xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
          xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtensions>
      <ext:UBLExtension>
        <ext:ExtensionContent>
          <PreviousInvoiceHash>${this.escapeXml(doc.previousHash || "")}</PreviousInvoiceHash>
          <InvoiceHash>${this.escapeXml(doc.currentHash)}</InvoiceHash>
          <QRCode>${this.escapeXml(qrPayload)}</QRCode>
        </ext:ExtensionContent>
      </ext:UBLExtension>
    </ext:UBLExtensions>

    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
    <cbc:ID>${this.escapeXml(invoice.invoiceNumber)}</cbc:ID>
    <cbc:UUID>${this.escapeXml(doc.uuid)}</cbc:UUID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
    <cbc:IssueTime>${issueTime}</cbc:IssueTime>
    <cbc:DueDate>${dueDate}</cbc:DueDate>
    <cbc:InvoiceTypeCode name="${invoice.complianceInvoiceKind}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>${this.escapeXml(invoice.currencyCode)}</cbc:DocumentCurrencyCode>
    <cbc:TaxCurrencyCode>${this.escapeXml(invoice.currencyCode)}</cbc:TaxCurrencyCode>

    ${
      invoice.notes?.trim()
        ? `<cbc:Note>${this.escapeXml(invoice.notes.trim())}</cbc:Note>`
        : ""
    }

    <cac:AdditionalDocumentReference>
      <cbc:ID>QR</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${this.escapeXml(qrPayload)}</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment>
    </cac:AdditionalDocumentReference>

    <cac:AccountingSupplierParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="VAT">${this.escapeXml(sellerVat)}</cbc:ID>
        </cac:PartyIdentification>
        ${
          sellerRegistration
            ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${this.escapeXml(sellerRegistration)}</cbc:ID></cac:PartyIdentification>`
            : ""
        }
        <cac:PostalAddress>
          <cbc:StreetName>${this.escapeXml(sellerAddress1)}</cbc:StreetName>
          <cbc:AdditionalStreetName>${this.escapeXml(sellerAddress2)}</cbc:AdditionalStreetName>
          <cbc:CityName>${this.escapeXml(sellerCity)}</cbc:CityName>
          <cbc:PostalZone>${this.escapeXml(sellerPostal)}</cbc:PostalZone>
          <cac:Country>
            <cbc:IdentificationCode>${this.escapeXml(sellerCountry)}</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${this.escapeXml(sellerVat)}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${this.escapeXml(sellerName)}</cbc:RegistrationName>
        </cac:PartyLegalEntity>
      </cac:Party>
    </cac:AccountingSupplierParty>

    <cac:AccountingCustomerParty>
      <cac:Party>
        ${
          buyerVat
            ? `<cac:PartyIdentification><cbc:ID schemeID="VAT">${this.escapeXml(buyerVat)}</cbc:ID></cac:PartyIdentification>`
            : ""
        }
        <cac:PostalAddress>
          <cbc:StreetName>${this.escapeXml(buyerAddress1)}</cbc:StreetName>
          <cbc:AdditionalStreetName>${this.escapeXml(buyerAddress2)}</cbc:AdditionalStreetName>
          <cbc:CityName>${this.escapeXml(buyerCity)}</cbc:CityName>
          <cbc:PostalZone>${this.escapeXml(buyerPostal)}</cbc:PostalZone>
          <cac:Country>
            <cbc:IdentificationCode>${this.escapeXml(buyerCountry)}</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${this.escapeXml(buyerName)}</cbc:RegistrationName>
        </cac:PartyLegalEntity>
      </cac:Party>
    </cac:AccountingCustomerParty>

    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.taxTotal)}</cbc:TaxAmount>
    </cac:TaxTotal>

    <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.subtotal)}</cbc:LineExtensionAmount>
      <cbc:TaxExclusiveAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.subtotal)}</cbc:TaxExclusiveAmount>
      <cbc:TaxInclusiveAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.total)}</cbc:TaxInclusiveAmount>
      <cbc:PrepaidAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.amountPaid)}</cbc:PrepaidAmount>
      <cbc:PayableAmount currencyID="${this.escapeXml(invoice.currencyCode)}">${this.formatDecimal(invoice.amountDue)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>

  ${lineXml}
  </Invoice>`;
  }

  private buildQrPayload(input: {
    sellerName: string;
    vatNumber: string;
    timestamp: Date;
    invoiceTotal: number;
    vatTotal: number;
  }) {
    const fields = [
      input.sellerName,
      input.vatNumber,
      input.timestamp.toISOString(),
      input.invoiceTotal.toFixed(2),
      input.vatTotal.toFixed(2)
    ];

    const buffers: Buffer[] = [];

    fields.forEach((value, index) => {
      const valueBuffer = Buffer.from(value, "utf8");
      buffers.push(
        Buffer.from([index + 1]),
        Buffer.from([valueBuffer.length]),
        valueBuffer
      );
    });

    return Buffer.concat(buffers).toString("base64");
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private formatTime(value: Date) {
    return value.toISOString().slice(11, 19);
  }

  private formatDecimal(value: Prisma.Decimal | number | string) {
    return new Prisma.Decimal(value).toFixed(2);
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private async createComplianceDocumentsForInvoices(
    organizationId: string,
    connectorAccountId: string
  ) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        organizationId,
        sourceConnectorAccountId: connectorAccountId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let created = 0;

    for (const invoice of invoices) {
      const existing = await this.prisma.complianceDocument.findFirst({
        where: {
          organizationId,
          salesInvoiceId: invoice.id
        }
      });

      if (existing) continue;

      const previousDocument = await this.prisma.complianceDocument.findFirst({
        where: {
          organizationId
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const previousHash = previousDocument?.currentHash ?? null;

      const currentHash = createHash("sha256")
        .update(
          JSON.stringify({
            organizationId,
            salesInvoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate.toISOString(),
            total: invoice.total.toString(),
            previousHash
          })
        )
        .digest("hex");

      await this.prisma.complianceDocument.create({
        data: {
          organizationId,
          salesInvoiceId: invoice.id,
          invoiceKind: invoice.complianceInvoiceKind,
          uuid: randomUUID(),
          qrPayload: "",
          previousHash,
          currentHash,
          status: "DRAFT",
          xmlContent: ""
        }
      });

      created++;
    }

    return created;
  }

  private async persistCanonicalInvoices(
    organizationId: string,
    connectorAccountId: string,
    invoices: CanonicalImportBundle["invoices"],
    contactIdsByExternalId: Map<string, string>
  ) {
    let persistedInvoices = 0;

    for (const invoice of invoices) {
      const contactId = await this.resolveImportedInvoiceContact(
        organizationId,
        connectorAccountId,
        invoice,
        contactIdsByExternalId
      );

      const issueDate = new Date(invoice.issueDate);
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : issueDate;

      const subtotal = this.toMoney(invoice.subtotal);
      const taxTotal = this.toMoney(invoice.taxTotal);
      const total = this.toMoney(invoice.total);

      const balanceValue =
        typeof invoice.balance === "number" ? invoice.balance : invoice.total;

      const amountDue = this.toMoney(balanceValue);
      const amountPaid = this.toMoney(
        Math.max(0, Number(invoice.total) - Number(balanceValue))
      );

      const status = this.mapImportedInvoiceStatus(
        invoice.status,
        balanceValue,
        invoice.total
      );

      const lineInputs = await Promise.all(
        invoice.lines.map(async (line, index) => {
          const lineSubtotal = this.toMoney(line.lineAmountExclusive);
          const lineTax = this.toMoney(
            typeof line.taxAmount === "number"
              ? line.taxAmount
              : typeof line.lineAmountInclusive === "number"
                ? line.lineAmountInclusive - line.lineAmountExclusive
                : 0
          );
          const lineTotal = this.toMoney(
            Number(lineSubtotal) + Number(lineTax)
          );

          const taxRate = await this.findMatchingTaxRate(
            organizationId,
            line.taxCode ?? null,
            typeof line.taxRate === "number" ? line.taxRate : null
          );

          return {
            description: line.description.trim() || "Imported line item",
            quantity: this.toMoney(line.quantity),
            unitPrice: this.toMoney(line.unitPrice),
            taxRateId: taxRate?.id ?? null,
            taxRateName: taxRate?.name ?? line.taxCode ?? null,
            taxRatePercent: this.toMoney(
              taxRate ? Number(taxRate.rate) : (line.taxRate ?? 0)
            ),
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder: index
          };
        })
      );

      let existing = null as Awaited<
        ReturnType<typeof this.prisma.salesInvoice.findFirst>
      >;

      if (invoice.externalId) {
        existing = await this.prisma.salesInvoice.findUnique({
          where: {
            organizationId_sourceProvider_sourceExternalId: {
              organizationId,
              sourceProvider: invoice.provider,
              sourceExternalId: invoice.externalId
            }
          }
        });
      }

      if (!existing) {
        existing = await this.prisma.salesInvoice.findUnique({
          where: {
            organizationId_invoiceNumber: {
              organizationId,
              invoiceNumber: invoice.documentNumber
            }
          }
        });
      }

      if (existing) {
        await this.prisma.$transaction([
          this.prisma.salesInvoiceLine.deleteMany({
            where: {
              salesInvoiceId: existing.id
            }
          }),
          this.prisma.salesInvoice.update({
            where: {
              id: existing.id
            },
            data: {
              contactId,
              invoiceNumber: invoice.documentNumber,
              status,
              complianceInvoiceKind: "STANDARD",
              issueDate,
              dueDate,
              currencyCode: invoice.currency,
              notes: `Imported from ${invoice.provider} connector ${connectorAccountId}`,
              subtotal,
              taxTotal,
              total,
              amountPaid,
              amountDue,
              sourceConnectorAccountId: connectorAccountId,
              sourceExternalId: invoice.externalId,
              sourcePayload: invoice.raw as Prisma.InputJsonValue,
              sourceProvider: invoice.provider,
              lines: {
                create: lineInputs
              }
            }
          })
        ]);
      } else {
        await this.prisma.salesInvoice.create({
          data: {
            organizationId,
            contactId,
            invoiceNumber: invoice.documentNumber,
            status,
            complianceInvoiceKind: "STANDARD",
            issueDate,
            dueDate,
            currencyCode: invoice.currency,
            notes: `Imported from ${invoice.provider} connector ${connectorAccountId}`,
            subtotal,
            taxTotal,
            total,
            amountPaid,
            amountDue,
            sourceConnectorAccountId: connectorAccountId,
            sourceExternalId: invoice.externalId,
            sourcePayload: invoice.raw as Prisma.InputJsonValue,
            sourceProvider: invoice.provider,
            lines: {
              create: lineInputs
            }
          }
        });
      }

      persistedInvoices += 1;
    }

    return persistedInvoices;
  }

  private async upsertImportedContact(
    organizationId: string,
    connectorAccountId: string,
    contact: CanonicalImportBundle["contacts"][number]
  ) {
    const displayName = contact.displayName.trim();

    if (!displayName) {
      throw new Error("Imported contact display name is required.");
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        displayName
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let contactId: string;

    if (existing) {
      const updated = await this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          companyName: existing.companyName ?? displayName,
          email: contact.email ?? existing.email ?? undefined,
          taxNumber: contact.taxNumber ?? existing.taxNumber ?? undefined,
          isCustomer: true,
          isSupplier: false,
          currencyCode: existing.currencyCode ?? contact.currencyCode ?? undefined,
          notes: `Imported from connector ${connectorAccountId}`
        }
      });

      contactId = updated.id;
    } else {
      const created = await this.prisma.contact.create({
        data: {
          organizationId,
          displayName,
          companyName: displayName,
          email: contact.email ?? undefined,
          taxNumber: contact.taxNumber ?? undefined,
          isCustomer: true,
          isSupplier: false,
          currencyCode: contact.currencyCode ?? undefined,
          notes: `Imported from connector ${connectorAccountId}`
        }
      });

      contactId = created.id;
    }

    const phoneNumber = contact.phone?.trim();

    if (phoneNumber) {
      const existingNumber = await this.prisma.contactNumber.findFirst({
        where: {
          contactId,
          phoneNumber
        }
      });

      if (!existingNumber) {
        await this.prisma.contactNumber.create({
          data: {
            contactId,
            label: "Primary",
            phoneNumber
          }
        });
      }
    }

    return contactId;
  }

  private getAdapter(provider: ConnectorProvider) {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(`Adapter missing for ${provider}`);
    }

    return adapter;
  }

  private getTransport(provider: ConnectorProvider) {
    const transport = this.transports.get(provider);

    if (!transport) {
      throw new Error(`Transport missing for ${provider}`);
    }

    return transport;
  }
}