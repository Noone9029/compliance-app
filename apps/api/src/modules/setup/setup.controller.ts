import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import {
  accountTypes,
  taxRateScopes,
  type PermissionKey
} from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { SetupService } from "./setup.service";

const booleanWithDefault = z.boolean().default(true);

const currencyCreateSchema = z.object({
  code: z.string().min(3).max(3),
  name: z.string().min(1),
  symbol: z.string().min(1),
  exchangeRate: z.string().min(1),
  isBase: z.boolean().default(false),
  isActive: booleanWithDefault
});

const taxRateCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().trim().optional().nullable(),
  rate: z.string().min(1),
  scope: z.enum(taxRateScopes),
  isDefault: z.boolean().default(false),
  isActive: booleanWithDefault
});

const organizationTaxDetailSchema = z.object({
  legalName: z.string().min(1),
  taxNumber: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  taxOffice: z.string().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable()
});

const trackingCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isActive: booleanWithDefault,
  options: z
    .array(
      z.object({
        name: z.string().min(1),
        color: z.string().optional().nullable(),
        isActive: booleanWithDefault
      })
    )
    .default([])
});

const bankAccountSchema = z.object({
  name: z.string().min(1),
  bankName: z.string().min(1),
  accountName: z.string().min(1),
  accountNumberMasked: z.string().min(4),
  iban: z.string().optional().nullable(),
  currencyCode: z.string().min(3).max(3),
  openingBalance: z.string().min(1),
  isPrimary: z.boolean().default(false),
  isActive: booleanWithDefault
});

const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(accountTypes),
  description: z.string().optional().nullable(),
  isSystem: z.boolean().default(false),
  isActive: booleanWithDefault
});

const invoiceSettingsSchema = z.object({
  invoicePrefix: z.string().min(1),
  defaultDueDays: z.coerce.number().int().nonnegative(),
  footerNote: z.string(),
  whatsappEnabled: z.boolean()
});

const emailTemplateSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  isDefault: z.boolean().default(false),
  isActive: booleanWithDefault
});

const customSettingsSchema = z.object({
  defaultLanguage: z.string().min(2),
  timezone: z.string().min(1),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  notes: z.string()
});

function parsePatch<TShape extends z.core.$ZodShape>(schema: z.ZodObject<TShape>) {
  return schema.partial().refine(
    (value: Record<string, unknown>) => Object.keys(value).length > 0,
    "At least one field is required."
  );
}

@Controller("v1/setup")
@UseGuards(AuthenticatedGuard)
export class SetupController {
  private readonly setupService: SetupService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(SetupService) setupService: SetupService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.setupService = setupService;
    this.auditService = auditService;
  }

  @Get("currencies")
  listCurrencies(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.listCurrencies(session!.organization!.id);
  }

  @Post("currencies")
  async createCurrency(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = currencyCreateSchema.parse(body);
    const record = await this.setupService.createCurrency(session!.organization!.id, parsed);
    await this.logMutation(session, "setup.currency.create", "currency", record.id);
    return record;
  }

  @Patch("currencies/:currencyId")
  async updateCurrency(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("currencyId") currencyId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(currencyCreateSchema).parse(body);
    const record = await this.setupService.updateCurrency(
      session!.organization!.id,
      currencyId,
      parsed
    );
    await this.logMutation(session, "setup.currency.update", "currency", record.id);
    return record;
  }

  @Get("tax-rates")
  listTaxRates(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.listTaxRates(session!.organization!.id);
  }

  @Post("tax-rates")
  async createTaxRate(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = taxRateCreateSchema.parse(body);
    const record = await this.setupService.createTaxRate(session!.organization!.id, parsed);
    await this.logMutation(session, "setup.tax_rate.create", "tax_rate", record.id);
    return record;
  }

  @Patch("tax-rates/:taxRateId")
  async updateTaxRate(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("taxRateId") taxRateId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(taxRateCreateSchema).parse(body);
    const record = await this.setupService.updateTaxRate(
      session!.organization!.id,
      taxRateId,
      parsed
    );
    await this.logMutation(session, "setup.tax_rate.update", "tax_rate", record.id);
    return record;
  }

  @Get("organisation-tax-details")
  getOrganizationTaxDetails(
    @CurrentSession() session: AuthenticatedRequest["currentSession"]
  ) {
    requirePermission(session, "setup.read");
    return this.setupService.getOrganizationTaxDetails(session!.organization!.id);
  }

  @Put("organisation-tax-details")
  async putOrganizationTaxDetails(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = organizationTaxDetailSchema.parse(body);
    const record = await this.setupService.upsertOrganizationTaxDetails(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(
      session,
      "setup.organization_tax_detail.upsert",
      "organization_tax_detail",
      record.id
    );
    return record;
  }

  @Get("tracking-categories")
  listTrackingCategories(
    @CurrentSession() session: AuthenticatedRequest["currentSession"]
  ) {
    requirePermission(session, "setup.read");
    return this.setupService.listTrackingCategories(session!.organization!.id);
  }

  @Post("tracking-categories")
  async createTrackingCategory(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = trackingCategorySchema.parse(body);
    const record = await this.setupService.createTrackingCategory(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(
      session,
      "setup.tracking_category.create",
      "tracking_category",
      record.id
    );
    return record;
  }

  @Patch("tracking-categories/:trackingCategoryId")
  async updateTrackingCategory(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("trackingCategoryId") trackingCategoryId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(trackingCategorySchema).parse(body);
    const record = await this.setupService.updateTrackingCategory(
      session!.organization!.id,
      trackingCategoryId,
      parsed
    );
    await this.logMutation(
      session,
      "setup.tracking_category.update",
      "tracking_category",
      record.id
    );
    return record;
  }

  @Get("bank-accounts")
  listBankAccounts(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.listBankAccounts(session!.organization!.id);
  }

  @Post("bank-accounts")
  async createBankAccount(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = bankAccountSchema.parse(body);
    const record = await this.setupService.createBankAccount(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(session, "setup.bank_account.create", "bank_account", record.id);
    return record;
  }

  @Patch("bank-accounts/:bankAccountId")
  async updateBankAccount(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("bankAccountId") bankAccountId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(bankAccountSchema).parse(body);
    const record = await this.setupService.updateBankAccount(
      session!.organization!.id,
      bankAccountId,
      parsed
    );
    await this.logMutation(session, "setup.bank_account.update", "bank_account", record.id);
    return record;
  }

  @Get("chart-of-accounts")
  listAccounts(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.listAccounts(session!.organization!.id);
  }

  @Post("chart-of-accounts")
  async createAccount(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = accountSchema.parse(body);
    const record = await this.setupService.createAccount(session!.organization!.id, parsed);
    await this.logMutation(session, "setup.account.create", "account", record.id);
    return record;
  }

  @Patch("chart-of-accounts/:accountId")
  async updateAccount(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("accountId") accountId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(accountSchema).parse(body);
    const record = await this.setupService.updateAccount(
      session!.organization!.id,
      accountId,
      parsed
    );
    await this.logMutation(session, "setup.account.update", "account", record.id);
    return record;
  }

  @Get("invoice-settings")
  getInvoiceSettings(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.getInvoiceSettings(session!.organization!.id);
  }

  @Put("invoice-settings")
  async putInvoiceSettings(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = invoiceSettingsSchema.parse(body);
    const record = await this.setupService.updateInvoiceSettings(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(
      session,
      "setup.invoice_settings.update",
      "organization_setting",
      session!.organization!.id
    );
    return record;
  }

  @Get("email-templates")
  listEmailTemplates(
    @CurrentSession() session: AuthenticatedRequest["currentSession"]
  ) {
    requirePermission(session, "setup.read");
    return this.setupService.listEmailTemplates(session!.organization!.id);
  }

  @Post("email-templates")
  async createEmailTemplate(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = emailTemplateSchema.parse(body);
    const record = await this.setupService.createEmailTemplate(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(
      session,
      "setup.email_template.create",
      "email_template",
      record.id
    );
    return record;
  }

  @Patch("email-templates/:emailTemplateId")
  async updateEmailTemplate(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("emailTemplateId") emailTemplateId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = parsePatch(emailTemplateSchema).parse(body);
    const record = await this.setupService.updateEmailTemplate(
      session!.organization!.id,
      emailTemplateId,
      parsed
    );
    await this.logMutation(
      session,
      "setup.email_template.update",
      "email_template",
      record.id
    );
    return record;
  }

  @Get("custom-organisation-settings")
  getCustomSettings(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "setup.read");
    return this.setupService.getCustomOrganizationSettings(session!.organization!.id);
  }

  @Put("custom-organisation-settings")
  async putCustomSettings(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "setup.write");
    const parsed = customSettingsSchema.parse(body);
    const record = await this.setupService.updateCustomOrganizationSettings(
      session!.organization!.id,
      parsed
    );
    await this.logMutation(
      session,
      "setup.custom_settings.update",
      "organization_setting",
      session!.organization!.id
    );
    return record;
  }

  private async logMutation(
    session: AuthenticatedRequest["currentSession"],
    action: string,
    targetType: string,
    targetId: string,
    permission: PermissionKey = "setup.write"
  ) {
    requirePermission(session, permission);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action,
      targetType,
      targetId,
      result: "SUCCESS"
    });
  }
}
