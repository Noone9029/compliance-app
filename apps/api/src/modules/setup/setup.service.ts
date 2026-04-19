import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CustomOrganizationSettingsRecord,
  InvoiceSettingsRecord
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

const invoiceSettingsKey = "week2.invoice.settings";
const customSettingsKey = "week2.custom.settings";

const defaultInvoiceSettings: InvoiceSettingsRecord = {
  invoicePrefix: "INV",
  defaultDueDays: 15,
  footerNote: "Thank you for choosing Daftar.",
  whatsappEnabled: false
};

const defaultCustomSettings: CustomOrganizationSettingsRecord = {
  defaultLanguage: "en",
  timezone: "Asia/Riyadh",
  fiscalYearStartMonth: 1,
  notes: ""
};

@Injectable()
export class SetupService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  listCurrencies(organizationId: string) {
    return this.prisma.currency.findMany({
      where: { organizationId },
      orderBy: [{ isBase: "desc" }, { code: "asc" }]
    });
  }

  createCurrency(
    organizationId: string,
    input: {
      code: string;
      name: string;
      symbol: string;
      exchangeRate: string;
      isBase: boolean;
      isActive: boolean;
    }
  ) {
    return this.prisma.currency.create({
      data: {
        organizationId,
        code: input.code.toUpperCase(),
        name: input.name,
        symbol: input.symbol,
        exchangeRate: input.exchangeRate,
        isBase: input.isBase,
        isActive: input.isActive
      }
    });
  }

  async updateCurrency(
    organizationId: string,
    currencyId: string,
    input: Partial<{
      code: string;
      name: string;
      symbol: string;
      exchangeRate: string;
      isBase: boolean;
      isActive: boolean;
    }>
  ) {
    await this.ensureCurrency(organizationId, currencyId);

    return this.prisma.currency.update({
      where: { id: currencyId },
      data: {
        code: input.code?.toUpperCase(),
        name: input.name,
        symbol: input.symbol,
        exchangeRate: input.exchangeRate,
        isBase: input.isBase,
        isActive: input.isActive
      }
    });
  }

  listTaxRates(organizationId: string) {
    return this.prisma.taxRate.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }]
    });
  }

  createTaxRate(
    organizationId: string,
    input: {
      name: string;
      code?: string | null;
      rate: string;
      scope: "SALES" | "PURCHASE" | "BOTH";
      isDefault: boolean;
      isActive: boolean;
    }
  ) {
    return this.prisma.taxRate.create({
      data: {
        organizationId,
        name: input.name,
        code: input.code ?? null,
        rate: input.rate,
        scope: input.scope,
        isDefault: input.isDefault,
        isActive: input.isActive
      }
    });
  }

  async updateTaxRate(
    organizationId: string,
    taxRateId: string,
    input: Partial<{
      name: string;
      code: string | null;
      rate: string;
      scope: "SALES" | "PURCHASE" | "BOTH";
      isDefault: boolean;
      isActive: boolean;
    }>
  ) {
    await this.ensureTaxRate(organizationId, taxRateId);

    return this.prisma.taxRate.update({
      where: { id: taxRateId },
      data: {
        name: input.name,
        code: input.code,
        rate: input.rate,
        scope: input.scope,
        isDefault: input.isDefault,
        isActive: input.isActive
      }
    });
  }

  async getOrganizationTaxDetails(organizationId: string) {
    return this.prisma.organizationTaxDetail.findUnique({
      where: { organizationId }
    });
  }

  upsertOrganizationTaxDetails(
    organizationId: string,
    input: {
      legalName: string;
      taxNumber: string;
      countryCode: string;
      taxOffice?: string | null;
      registrationNumber?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      postalCode?: string | null;
    }
  ) {
    return this.prisma.organizationTaxDetail.upsert({
      where: { organizationId },
      update: {
        legalName: input.legalName,
        taxNumber: input.taxNumber,
        countryCode: input.countryCode,
        taxOffice: input.taxOffice ?? null,
        registrationNumber: input.registrationNumber ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null
      },
      create: {
        organizationId,
        legalName: input.legalName,
        taxNumber: input.taxNumber,
        countryCode: input.countryCode,
        taxOffice: input.taxOffice ?? null,
        registrationNumber: input.registrationNumber ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null
      }
    });
  }

  async listTrackingCategories(organizationId: string) {
    return this.prisma.trackingCategory.findMany({
      where: { organizationId },
      include: {
        options: {
          orderBy: { name: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });
  }

  async createTrackingCategory(
    organizationId: string,
    input: {
      name: string;
      description?: string | null;
      isActive: boolean;
      options: { name: string; color?: string | null; isActive: boolean }[];
    }
  ) {
    return this.prisma.trackingCategory.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive,
        options: {
          create: input.options.map((option) => ({
            name: option.name,
            color: option.color ?? null,
            isActive: option.isActive
          }))
        }
      },
      include: {
        options: {
          orderBy: { name: "asc" }
        }
      }
    });
  }

  async updateTrackingCategory(
    organizationId: string,
    trackingCategoryId: string,
    input: Partial<{
      name: string;
      description: string | null;
      isActive: boolean;
      options: { name: string; color?: string | null; isActive: boolean }[];
    }>
  ) {
    await this.ensureTrackingCategory(organizationId, trackingCategoryId);

    await this.prisma.trackingCategory.update({
      where: { id: trackingCategoryId },
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive
      }
    });

    if (input.options) {
      await this.prisma.trackingOption.deleteMany({
        where: { trackingCategoryId }
      });

      if (input.options.length > 0) {
        await this.prisma.trackingOption.createMany({
          data: input.options.map((option) => ({
            trackingCategoryId,
            name: option.name,
            color: option.color ?? null,
            isActive: option.isActive
          }))
        });
      }
    }

    return this.prisma.trackingCategory.findUniqueOrThrow({
      where: { id: trackingCategoryId },
      include: {
        options: {
          orderBy: { name: "asc" }
        }
      }
    });
  }

  listBankAccounts(organizationId: string) {
    return this.prisma.bankAccount.findMany({
      where: { organizationId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
    });
  }

  createBankAccount(
    organizationId: string,
    input: {
      name: string;
      bankName: string;
      accountName: string;
      accountNumberMasked: string;
      iban?: string | null;
      currencyCode: string;
      openingBalance: string;
      isPrimary: boolean;
      isActive: boolean;
    }
  ) {
    return this.prisma.bankAccount.create({
      data: {
        organizationId,
        name: input.name,
        bankName: input.bankName,
        accountName: input.accountName,
        accountNumberMasked: input.accountNumberMasked,
        iban: input.iban ?? null,
        currencyCode: input.currencyCode.toUpperCase(),
        openingBalance: input.openingBalance,
        isPrimary: input.isPrimary,
        isActive: input.isActive
      }
    });
  }

  async updateBankAccount(
    organizationId: string,
    bankAccountId: string,
    input: Partial<{
      name: string;
      bankName: string;
      accountName: string;
      accountNumberMasked: string;
      iban: string | null;
      currencyCode: string;
      openingBalance: string;
      isPrimary: boolean;
      isActive: boolean;
    }>
  ) {
    await this.ensureBankAccount(organizationId, bankAccountId);

    return this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        name: input.name,
        bankName: input.bankName,
        accountName: input.accountName,
        accountNumberMasked: input.accountNumberMasked,
        iban: input.iban,
        currencyCode: input.currencyCode?.toUpperCase(),
        openingBalance: input.openingBalance,
        isPrimary: input.isPrimary,
        isActive: input.isActive
      }
    });
  }

  listAccounts(organizationId: string) {
    return this.prisma.account.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }]
    });
  }

  createAccount(
    organizationId: string,
    input: {
      code: string;
      name: string;
      type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
      description?: string | null;
      isSystem: boolean;
      isActive: boolean;
    }
  ) {
    return this.prisma.account.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        isSystem: input.isSystem,
        isActive: input.isActive
      }
    });
  }

  async updateAccount(
    organizationId: string,
    accountId: string,
    input: Partial<{
      code: string;
      name: string;
      type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
      description: string | null;
      isSystem: boolean;
      isActive: boolean;
    }>
  ) {
    await this.ensureAccount(organizationId, accountId);

    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        description: input.description,
        isSystem: input.isSystem,
        isActive: input.isActive
      }
    });
  }

  async getInvoiceSettings(
    organizationId: string
  ): Promise<InvoiceSettingsRecord> {
    const setting = await this.prisma.organizationSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: invoiceSettingsKey
        }
      }
    });

    return {
      ...defaultInvoiceSettings,
      ...((setting?.value as Record<string, unknown> | undefined) ?? {})
    } as InvoiceSettingsRecord;
  }

  async updateInvoiceSettings(
    organizationId: string,
    input: InvoiceSettingsRecord
  ): Promise<InvoiceSettingsRecord> {
    await this.prisma.organizationSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: invoiceSettingsKey
        }
      },
      update: {
        value: input
      },
      create: {
        organizationId,
        key: invoiceSettingsKey,
        value: input
      }
    });

    return input;
  }

  listEmailTemplates(organizationId: string) {
    return this.prisma.emailTemplate.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: "desc" }, { key: "asc" }]
    });
  }

  createEmailTemplate(
    organizationId: string,
    input: {
      key: string;
      name: string;
      subject: string;
      body: string;
      isDefault: boolean;
      isActive: boolean;
    }
  ) {
    return this.prisma.emailTemplate.create({
      data: {
        organizationId,
        key: input.key,
        name: input.name,
        subject: input.subject,
        body: input.body,
        isDefault: input.isDefault,
        isActive: input.isActive
      }
    });
  }

  async updateEmailTemplate(
    organizationId: string,
    emailTemplateId: string,
    input: Partial<{
      key: string;
      name: string;
      subject: string;
      body: string;
      isDefault: boolean;
      isActive: boolean;
    }>
  ) {
    await this.ensureEmailTemplate(organizationId, emailTemplateId);

    return this.prisma.emailTemplate.update({
      where: { id: emailTemplateId },
      data: {
        key: input.key,
        name: input.name,
        subject: input.subject,
        body: input.body,
        isDefault: input.isDefault,
        isActive: input.isActive
      }
    });
  }

  async getCustomOrganizationSettings(
    organizationId: string
  ): Promise<CustomOrganizationSettingsRecord> {
    const setting = await this.prisma.organizationSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: customSettingsKey
        }
      }
    });

    return {
      ...defaultCustomSettings,
      ...((setting?.value as Record<string, unknown> | undefined) ?? {})
    } as CustomOrganizationSettingsRecord;
  }

  async updateCustomOrganizationSettings(
    organizationId: string,
    input: CustomOrganizationSettingsRecord
  ): Promise<CustomOrganizationSettingsRecord> {
    await this.prisma.organizationSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: customSettingsKey
        }
      },
      update: {
        value: input
      },
      create: {
        organizationId,
        key: customSettingsKey,
        value: input
      }
    });

    return input;
  }

  private async ensureCurrency(organizationId: string, currencyId: string) {
    const record = await this.prisma.currency.findFirst({
      where: { id: currencyId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Currency not found.");
    }
  }

  private async ensureTaxRate(organizationId: string, taxRateId: string) {
    const record = await this.prisma.taxRate.findFirst({
      where: { id: taxRateId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Tax rate not found.");
    }
  }

  private async ensureTrackingCategory(
    organizationId: string,
    trackingCategoryId: string
  ) {
    const record = await this.prisma.trackingCategory.findFirst({
      where: { id: trackingCategoryId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Tracking category not found.");
    }
  }

  private async ensureBankAccount(
    organizationId: string,
    bankAccountId: string
  ) {
    const record = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Bank account not found.");
    }
  }

  private async ensureAccount(organizationId: string, accountId: string) {
    const record = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Account not found.");
    }
  }

  private async ensureEmailTemplate(
    organizationId: string,
    emailTemplateId: string
  ) {
    const record = await this.prisma.emailTemplate.findFirst({
      where: { id: emailTemplateId, organizationId }
    });

    if (!record) {
      throw new NotFoundException("Email template not found.");
    }
  }
}
