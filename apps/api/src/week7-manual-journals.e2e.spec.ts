import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 7 manual journals", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL,
      },
    },
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

  it("lists seeded manual journals and returns a selected journal detail", async () => {
    const cookies = await signIn("admin@daftar.local");

    const listResponse = await request(app.getHttpServer())
      .get("/v1/journals")
      .set("Cookie", cookies)
      .expect(200);

    expect(listResponse.body.length).toBeGreaterThan(0);
    expect(listResponse.body[0].journalNumber).toMatch(/^MJ-/);

    const detailResponse = await request(app.getHttpServer())
      .get(`/v1/journals/${listResponse.body[0].id}`)
      .set("Cookie", cookies)
      .expect(200);

    expect(detailResponse.body.lines.length).toBeGreaterThanOrEqual(2);
    expect(detailResponse.body.totalDebit).toBe(
      detailResponse.body.totalCredit,
    );
  });

  it("creates a balanced manual journal for the tenant", async () => {
    const cookies = await signIn("admin@daftar.local");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const accounts = await prisma.account.findMany({
      where: {
        organizationId: organization.id,
        code: { in: ["1000", "5100"] },
      },
      orderBy: { code: "asc" },
    });

    const response = await request(app.getHttpServer())
      .post("/v1/journals")
      .set("Cookie", cookies)
      .send({
        journalNumber: "MJ-0999",
        reference: "TEST-ADJ",
        entryDate: "2026-04-17T00:00:00.000Z",
        memo: "Seeded test journal.",
        lines: [
          {
            accountId: accounts[1]!.id,
            description: "Expense adjustment",
            debit: "125.00",
            credit: "0.00",
          },
          {
            accountId: accounts[0]!.id,
            description: "Cash offset",
            debit: "0.00",
            credit: "125.00",
          },
        ],
      })
      .expect(201);

    expect(response.body.journalNumber).toBe("MJ-0999");
    expect(response.body.totalDebit).toBe("125.00");
    expect(response.body.totalCredit).toBe("125.00");
  });

  it("blocks journal creation for read-only viewers", async () => {
    const cookies = await signIn("viewer@daftar.local");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" },
    });
    const accounts = await prisma.account.findMany({
      where: {
        organizationId: organization.id,
        code: { in: ["1000", "5100"] },
      },
      orderBy: { code: "asc" },
    });

    await request(app.getHttpServer())
      .post("/v1/journals")
      .set("Cookie", cookies)
      .send({
        entryDate: "2026-04-17T00:00:00.000Z",
        memo: "Unauthorized journal.",
        lines: [
          {
            accountId: accounts[1]!.id,
            description: "Expense adjustment",
            debit: "50.00",
            credit: "0.00",
          },
          {
            accountId: accounts[0]!.id,
            description: "Cash offset",
            debit: "0.00",
            credit: "50.00",
          },
        ],
      })
      .expect(403);
  });
});
