import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import { billingPlanCodes, billingSubscriptionStatuses } from "@daftar/types";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { BillingService } from "./billing.service";

const billingSummarySchema = z.object({
  stripeCustomerId: z.string().optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  subscriptionId: z.string().optional().nullable(),
  planCode: z.enum(billingPlanCodes),
  status: z.enum(billingSubscriptionStatuses),
  seats: z.number().int().positive(),
  currentPeriodStart: z.string().optional().nullable(),
  currentPeriodEnd: z.string().optional().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false)
});

const billingInvoiceSchema = z.object({
  stripeInvoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  status: z.string().min(1),
  total: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  issuedAt: z.string().min(1),
  dueAt: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  hostedInvoiceUrl: z.string().url().optional().nullable()
});

const billingSubscriptionSchema = z.object({
  stripeCustomerId: z.string().min(1),
  billingEmail: z.string().email().optional().nullable(),
  subscriptionId: z.string().min(1),
  planCode: z.enum(billingPlanCodes),
  status: z.enum(billingSubscriptionStatuses),
  seats: z.number().int().positive(),
  currentPeriodStart: z.string().optional().nullable(),
  currentPeriodEnd: z.string().optional().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false)
});

const billingSubscriptionPatchSchema = billingSubscriptionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const billingCancelSchema = z.object({
  immediate: z.boolean().optional().nullable()
});

@Controller("v1/billing")
@UseGuards(AuthenticatedGuard)
export class BillingController {
  private readonly billingService: BillingService;

  constructor(@Inject(BillingService) billingService: BillingService) {
    this.billingService = billingService;
  }

  @Get("plans")
  listPlans(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "billing.read");
    return this.billingService.listPlans();
  }

  @Get("summary")
  getSummary(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "billing.read");
    return this.billingService.getSummary(session!.organization!.id);
  }

  @Put("summary")
  async updateSummary(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "billing.write");
    billingSummarySchema.parse(body);
    throw new ConflictException(
      "Billing summary changes are read-only in this workspace until live billing management is enabled."
    );
  }

  @Get("invoices")
  listInvoices(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "billing.read");
    return this.billingService.listInvoices(session!.organization!.id);
  }

  @Post("subscription")
  async createSubscription(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "billing.write");
    billingSubscriptionSchema.parse(body);
    throw new ConflictException(
      "Subscriptions are managed from the billing integration. Manual creation is not available in this workspace."
    );
  }

  @Patch("subscription")
  async updateSubscription(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "billing.write");
    billingSubscriptionPatchSchema.parse(body);
    throw new ConflictException(
      "Subscriptions are read-only in this workspace until live billing management is enabled."
    );
  }

  @Post("subscription/cancel")
  async cancelSubscription(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "billing.write");
    billingCancelSchema.parse(body ?? {});
    throw new ConflictException(
      "Subscription cancellation is read-only in this workspace until live billing management is enabled."
    );
  }

  @Post("invoices")
  async createInvoice(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "billing.write");
    billingInvoiceSchema.parse(body);
    throw new ConflictException(
      "Billing invoices are read-only in this workspace and are created by the billing integration."
    );
  }
}
