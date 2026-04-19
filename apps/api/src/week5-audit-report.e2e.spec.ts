import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 5 audit report", () => {
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

  it("returns tenant-scoped audit events and applies query filters", async () => {
    const cookies = await signIn("admin@daftar.local");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });

    const report = await request(app.getHttpServer())
      .get("/v1/audit-report?search=week4&result=SUCCESS")
      .set("Cookie", cookies)
      .expect(200);

    expect(report.body.metrics.totalEvents).toBeGreaterThan(0);
    expect(report.body.events.length).toBeGreaterThan(0);

    for (const event of report.body.events) {
      expect(event.organizationId).toBe(organization.id);
      expect(event.result).toBe("SUCCESS");
      expect(String(event.action).toLowerCase()).toContain("week4");
    }
  });

  it("enforces audit report permissions", async () => {
    const cookies = await signIn("viewer@daftar.local");

    await request(app.getHttpServer())
      .get("/v1/audit-report")
      .set("Cookie", cookies)
      .expect(403);
  });
});
