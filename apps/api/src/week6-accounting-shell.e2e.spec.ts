import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 6 accounting shell", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL
      }
    }
  });
  let app: INestApplication;

  async function signIn(email: string) {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email, password: "Password123!" })
      .expect(201);

    return response.headers["set-cookie"];
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns the accounting dashboard shell dataset", async () => {
    const cookies = await signIn("admin@daftar.local");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const [bankAccounts, invoicePayments, billPayments] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { organizationId: organization.id, isActive: true },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          openingBalance: true
        }
      }),
      prisma.invoicePayment.findMany({
        where: { salesInvoice: { organizationId: organization.id } },
        select: {
          amount: true,
          bankAccountId: true
        }
      }),
      prisma.billPayment.findMany({
        where: { purchaseBill: { organizationId: organization.id } },
        select: {
          amount: true,
          bankAccountId: true
        }
      })
    ]);
    const cashInByBank = new Map<string, number>();
    const cashOutByBank = new Map<string, number>();

    for (const payment of invoicePayments) {
      if (!payment.bankAccountId) {
        continue;
      }

      cashInByBank.set(
        payment.bankAccountId,
        (cashInByBank.get(payment.bankAccountId) ?? 0) + Number(payment.amount)
      );
    }

    for (const payment of billPayments) {
      if (!payment.bankAccountId) {
        continue;
      }

      cashOutByBank.set(
        payment.bankAccountId,
        (cashOutByBank.get(payment.bankAccountId) ?? 0) + Number(payment.amount)
      );
    }

    const expectedBankBalances = bankAccounts.map((account) => ({
      label: account.name,
      value: (
        Number(account.openingBalance) +
        (cashInByBank.get(account.id) ?? 0) -
        (cashOutByBank.get(account.id) ?? 0)
      ).toFixed(2)
    }));

    const response = await request(app.getHttpServer())
      .get("/v1/accounting/dashboard")
      .set("Cookie", cookies)
      .expect(200);

    expect(response.body.organizationName).toBeTruthy();
    expect(Array.isArray(response.body.bankBalances)).toBe(true);
    expect(Array.isArray(response.body.profitLossSeries)).toBe(true);
    expect(Array.isArray(response.body.cashFlow)).toBe(true);
    expect(response.body.salesPurchases).toHaveLength(2);
    expect(response.body.bankBalances).toEqual(expectedBankBalances);
  });

  it("returns organisation stats with selected filters", async () => {
    const cookies = await signIn("admin@daftar.local");
    const currentYear = new Date().getUTCFullYear();

    const response = await request(app.getHttpServer())
      .get(`/v1/accounting/organisation-stats?year=${currentYear}&month=4`)
      .set("Cookie", cookies)
      .expect(200);

    expect(response.body.selectedYear).toBe(currentYear);
    expect(response.body.selectedMonth).toBe(4);
    expect(Array.isArray(response.body.availableYears)).toBe(true);
    expect(Array.isArray(response.body.usersByRole)).toBe(true);
    expect(Array.isArray(response.body.membershipStatus)).toBe(true);
    expect(typeof response.body.activeUsersThisPeriod).toBe("number");
  });
});
