import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { billingPlanCodes, billingSubscriptionStatuses } from "@daftar/types";
import { z } from "zod";

import { AuditService } from "../audit/audit.service";
import { BillingService } from "./billing.service";

const billingWebhookSchema = z.object({
  type: z.enum([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed"
  ]),
  data: z.object({
    organizationId: z.string().optional(),
    stripeCustomerId: z.string().optional(),
    stripeSubscriptionId: z.string().optional(),
    billingEmail: z.string().email().optional().nullable(),
    planCode: z.enum(billingPlanCodes).optional(),
    status: z.enum(billingSubscriptionStatuses).optional(),
    seats: z.number().int().positive().optional(),
    currentPeriodStart: z.string().optional().nullable(),
    currentPeriodEnd: z.string().optional().nullable(),
    cancelAtPeriodEnd: z.boolean().optional(),
    invoice: z
      .object({
        stripeInvoiceId: z.string().min(1),
        invoiceNumber: z.string().min(1),
        status: z.string().min(1),
        total: z.string().min(1),
        currencyCode: z.string().min(3).max(3),
        issuedAt: z.string().min(1),
        dueAt: z.string().optional().nullable(),
        paidAt: z.string().optional().nullable(),
        hostedInvoiceUrl: z.string().url().optional().nullable()
      })
      .optional()
  })
});

@Controller("v1/billing/webhooks")
export class BillingWebhookController {
  private readonly billingService: BillingService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(BillingService) billingService: BillingService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.billingService = billingService;
    this.auditService = auditService;
  }

  @Post("stripe")
  async handleStripeWebhook(
    @Headers("x-stripe-signature") signature: string | undefined,
    @Body() body: unknown,
    @Req() request: Request & { rawBody?: Buffer }
  ) {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : request.rawBody;
    if (!rawBody) {
      throw new BadRequestException("Raw Stripe webhook payload is required.");
    }
    let decodedBody = body;
    if (Buffer.isBuffer(body)) {
      try {
        decodedBody = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new BadRequestException("Invalid Stripe webhook payload.");
      }
    }
    const parsed = billingWebhookSchema.parse(decodedBody);
    const result = await this.billingService.handleStripeWebhook(
      signature,
      rawBody,
      parsed
    );
    await this.auditService.log({
      organizationId: result.organizationId,
      actorType: "SYSTEM",
      action: "billing.webhook.processed",
      targetType: "billing_subscription",
      targetId: null,
      result: "SUCCESS",
      metadata: {
        eventType: parsed.type,
        status: result.status
      }
    });
    return result;
  }
}
