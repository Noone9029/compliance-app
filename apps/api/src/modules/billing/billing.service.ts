import { Inject, Injectable } from "@nestjs/common";
import type {
  BillingInvoiceRecord,
  BillingPlanRecord,
  BillingSummaryRecord
} from "@daftar/types";
import { billingPlanCodes } from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import { loadEnv } from "@daftar/config";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

const billingPlans: BillingPlanRecord[] = [
  {
    code: "STARTER",
    name: "Starter",
    description: "Foundational plan for small finance teams.",
    monthlyPrice: "79.00",
    currencyCode: "USD",
    includedSeats: 3,
    addOns: ["Extra seats", "Additional storage"]
  },
  {
    code: "GROWTH",
    name: "Growth",
    description: "Scaled plan for growing multi-user accounting operations.",
    monthlyPrice: "299.00",
    currencyCode: "USD",
    includedSeats: 10,
    addOns: ["Extra seats", "Priority support", "Advanced exports"]
  },
  {
    code: "SCALE",
    name: "Scale",
    description: "Operational plan for larger organizations and subsidiaries.",
    monthlyPrice: "499.00",
    currencyCode: "USD",
    includedSeats: 25,
    addOns: ["Extra seats", "Priority support", "Connector governance"]
  }
];

@Injectable()
export class BillingService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  listPlans(): BillingPlanRecord[] {
    return billingPlans;
  }

  async getSummary(organizationId: string): Promise<BillingSummaryRecord> {
    const subscription = await this.prisma.stripeSubscription.findUnique({
      where: { organizationId },
      include: { stripeCustomer: true }
    });

    return {
      stripeCustomerId: subscription?.stripeCustomer?.stripeCustomerId ?? null,
      billingEmail: subscription?.stripeCustomer?.billingEmail ?? null,
      subscriptionId: subscription?.stripeSubscriptionId ?? null,
      planCode: subscription?.planCode ?? null,
      status: subscription?.status ?? null,
      seats: subscription?.seats ?? 0,
      currentPeriodStart: subscription?.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false
    };
  }

  async createSubscription(
    organizationId: string,
    input: {
      stripeCustomerId: string;
      billingEmail?: string | null;
      subscriptionId: string;
      planCode: "STARTER" | "GROWTH" | "SCALE";
      status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
      seats: number;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd: boolean;
    }
  ) {
    return this.updateSummary(organizationId, {
      stripeCustomerId: input.stripeCustomerId,
      billingEmail: input.billingEmail ?? null,
      subscriptionId: input.subscriptionId,
      planCode: input.planCode,
      status: input.status,
      seats: input.seats,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd
    });
  }

  async updateSubscription(
    organizationId: string,
    input: Partial<{
      stripeCustomerId: string | null;
      billingEmail: string | null;
      subscriptionId: string | null;
      planCode: "STARTER" | "GROWTH" | "SCALE";
      status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
      seats: number;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    }>
  ) {
    const current = await this.getSummary(organizationId);

    if (!current.subscriptionId) {
      throw new Error("Subscription must exist before it can be updated.");
    }

    return this.updateSummary(organizationId, {
      stripeCustomerId: input.stripeCustomerId ?? current.stripeCustomerId,
      billingEmail: input.billingEmail ?? current.billingEmail,
      subscriptionId: input.subscriptionId ?? current.subscriptionId,
      planCode: input.planCode ?? current.planCode ?? "STARTER",
      status: input.status ?? current.status ?? "TRIALING",
      seats: input.seats ?? current.seats,
      currentPeriodStart: input.currentPeriodStart ?? current.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd ?? current.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd
    });
  }

  async cancelSubscription(
    organizationId: string,
    input: { immediate?: boolean | null }
  ) {
    const current = await this.getSummary(organizationId);

    if (!current.subscriptionId) {
      throw new Error("Subscription must exist before it can be canceled.");
    }

    const now = new Date().toISOString();

    return this.updateSummary(organizationId, {
      stripeCustomerId: current.stripeCustomerId,
      billingEmail: current.billingEmail,
      subscriptionId: current.subscriptionId,
      planCode: current.planCode ?? "STARTER",
      status: "CANCELED",
      seats: current.seats,
      currentPeriodStart: current.currentPeriodStart,
      currentPeriodEnd: input.immediate ? now : current.currentPeriodEnd,
      cancelAtPeriodEnd: input.immediate ? false : true
    });
  }

  async updateSummary(
    organizationId: string,
    input: {
      stripeCustomerId?: string | null;
      billingEmail?: string | null;
      subscriptionId?: string | null;
      planCode: "STARTER" | "GROWTH" | "SCALE";
      status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
      seats: number;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd: boolean;
    }
  ): Promise<BillingSummaryRecord> {
    let customerRecordId: string | null = null;

    if (input.stripeCustomerId) {
      const customer = await this.prisma.stripeCustomer.upsert({
        where: { organizationId },
        update: {
          stripeCustomerId: input.stripeCustomerId,
          billingEmail: input.billingEmail ?? null
        },
        create: {
          organizationId,
          stripeCustomerId: input.stripeCustomerId,
          billingEmail: input.billingEmail ?? null
        }
      });
      customerRecordId = customer.id;
    } else {
      await this.prisma.stripeCustomer.deleteMany({ where: { organizationId } });
    }

    if (input.subscriptionId) {
      await this.prisma.stripeSubscription.upsert({
        where: { organizationId },
        update: {
          stripeCustomerId: customerRecordId,
          stripeSubscriptionId: input.subscriptionId,
          planCode: input.planCode,
          status: input.status,
          seats: input.seats,
          currentPeriodStart: input.currentPeriodStart
            ? new Date(input.currentPeriodStart)
            : null,
          currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd
        },
        create: {
          organizationId,
          stripeCustomerId: customerRecordId,
          stripeSubscriptionId: input.subscriptionId,
          planCode: input.planCode,
          status: input.status,
          seats: input.seats,
          currentPeriodStart: input.currentPeriodStart
            ? new Date(input.currentPeriodStart)
            : null,
          currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd
        }
      });
    } else {
      await this.prisma.billingInvoice.deleteMany({
        where: {
          organizationId,
          stripeSubscription: { organizationId }
        }
      });
      await this.prisma.stripeSubscription.deleteMany({ where: { organizationId } });
    }

    return this.getSummary(organizationId);
  }

  async listInvoices(organizationId: string): Promise<BillingInvoiceRecord[]> {
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { organizationId },
      include: { stripeSubscription: true },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }]
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      organizationId: invoice.organizationId,
      stripeSubscriptionId: invoice.stripeSubscription?.stripeSubscriptionId ?? null,
      stripeInvoiceId: invoice.stripeInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      total: money(invoice.total),
      currencyCode: invoice.currencyCode,
      issuedAt: invoice.issuedAt.toISOString(),
      dueAt: invoice.dueAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      createdAt: invoice.createdAt.toISOString()
    }));
  }

  async createInvoice(
    organizationId: string,
    input: {
      stripeInvoiceId: string;
      invoiceNumber: string;
      status: string;
      total: string;
      currencyCode: string;
      issuedAt: string;
      dueAt?: string | null;
      paidAt?: string | null;
      hostedInvoiceUrl?: string | null;
    }
  ) {
    const subscription = await this.prisma.stripeSubscription.findUnique({
      where: { organizationId }
    });

    const invoice = await this.prisma.billingInvoice.create({
      data: {
        organizationId,
        stripeSubscriptionId: subscription?.id ?? null,
        stripeInvoiceId: input.stripeInvoiceId,
        invoiceNumber: input.invoiceNumber,
        status: input.status,
        total: input.total,
        currencyCode: input.currencyCode.toUpperCase(),
        issuedAt: new Date(input.issuedAt),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        paidAt: input.paidAt ? new Date(input.paidAt) : null,
        hostedInvoiceUrl: input.hostedInvoiceUrl ?? null
      }
    });

    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
      stripeInvoiceId: invoice.stripeInvoiceId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      total: money(invoice.total),
      currencyCode: invoice.currencyCode,
      issuedAt: invoice.issuedAt.toISOString(),
      dueAt: invoice.dueAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      createdAt: invoice.createdAt.toISOString()
    };
  }

  async handleStripeWebhook(
    signature: string | null | undefined,
    payload: {
      type:
        | "customer.subscription.created"
        | "customer.subscription.updated"
        | "customer.subscription.deleted"
        | "invoice.paid"
        | "invoice.payment_failed";
      data: {
        organizationId?: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        billingEmail?: string | null;
        planCode?: (typeof billingPlanCodes)[number];
        status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
        seats?: number;
        currentPeriodStart?: string | null;
        currentPeriodEnd?: string | null;
        cancelAtPeriodEnd?: boolean;
        invoice?: {
          stripeInvoiceId: string;
          invoiceNumber: string;
          status: string;
          total: string;
          currencyCode: string;
          issuedAt: string;
          dueAt?: string | null;
          paidAt?: string | null;
          hostedInvoiceUrl?: string | null;
        };
      };
    }
  ) {
    const env = loadEnv();
    if (!signature || signature !== env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Invalid Stripe webhook signature.");
    }

    const organizationId = await this.resolveWebhookOrganizationId(payload.data);
    if (!organizationId) {
      throw new Error("Unable to resolve billing organization for webhook event.");
    }

    const current = await this.getSummary(organizationId);
    const nextStatus =
      payload.type === "customer.subscription.deleted"
        ? "CANCELED"
        : payload.type === "invoice.payment_failed"
          ? "PAST_DUE"
          : payload.type === "invoice.paid"
            ? "ACTIVE"
            : payload.data.status ?? current.status ?? "TRIALING";

    if (
      payload.type.startsWith("customer.subscription") ||
      payload.type.startsWith("invoice.")
    ) {
      await this.updateSummary(organizationId, {
        stripeCustomerId:
          payload.data.stripeCustomerId ?? current.stripeCustomerId ?? null,
        billingEmail: payload.data.billingEmail ?? current.billingEmail,
        subscriptionId:
          payload.data.stripeSubscriptionId ?? current.subscriptionId ?? null,
        planCode: payload.data.planCode ?? current.planCode ?? "STARTER",
        status: nextStatus,
        seats: payload.data.seats ?? current.seats ?? 1,
        currentPeriodStart:
          payload.data.currentPeriodStart ?? current.currentPeriodStart,
        currentPeriodEnd: payload.data.currentPeriodEnd ?? current.currentPeriodEnd,
        cancelAtPeriodEnd:
          payload.data.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd
      });
    }

    if (payload.data.invoice) {
      const existingInvoice = await this.prisma.billingInvoice.findUnique({
        where: { stripeInvoiceId: payload.data.invoice.stripeInvoiceId }
      });

      if (existingInvoice) {
        await this.prisma.billingInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            status: payload.data.invoice.status,
            total: payload.data.invoice.total,
            currencyCode: payload.data.invoice.currencyCode.toUpperCase(),
            issuedAt: new Date(payload.data.invoice.issuedAt),
            dueAt: payload.data.invoice.dueAt
              ? new Date(payload.data.invoice.dueAt)
              : null,
            paidAt: payload.data.invoice.paidAt
              ? new Date(payload.data.invoice.paidAt)
              : null,
            hostedInvoiceUrl: payload.data.invoice.hostedInvoiceUrl ?? null
          }
        });
      } else {
        await this.createInvoice(organizationId, payload.data.invoice);
      }
    }

    return {
      received: true,
      organizationId,
      status: nextStatus
    };
  }

  private async resolveWebhookOrganizationId(input: {
    organizationId?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  }) {
    if (input.organizationId) {
      return input.organizationId;
    }

    if (input.stripeSubscriptionId) {
      const subscription = await this.prisma.stripeSubscription.findUnique({
        where: { stripeSubscriptionId: input.stripeSubscriptionId }
      });
      if (subscription) {
        return subscription.organizationId;
      }
    }

    if (input.stripeCustomerId) {
      const customer = await this.prisma.stripeCustomer.findUnique({
        where: { stripeCustomerId: input.stripeCustomerId }
      });
      return customer?.organizationId ?? null;
    }

    return null;
  }
}
