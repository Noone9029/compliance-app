import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { AuthNotificationService } from "./modules/auth/auth-notification.service";
import { installInMemoryStorage } from "./test/in-memory-storage";

describe.sequential("Daftar Week 1 platform", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL
      }
    }
  });
  let app: INestApplication;
  let authNotificationService: AuthNotificationService;

  beforeAll(async () => {
    app = await createApp();
    installInMemoryStorage(app);
    await app.init();
    authNotificationService = app.get(AuthNotificationService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns health and ready status", async () => {
    const health = await request(app.getHttpServer()).get("/health").expect(200);
    expect(health.body.status).toBe("ok");

    const ready = await request(app.getHttpServer()).get("/ready").expect(200);
    expect(ready.body.status).toBe("ready");
  });

  it("supports sign-in, session refresh, membership lookup, and sign-out", async () => {
    const signIn = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: "admin@daftar.local", password: "Password123!" })
      .expect(201);

    expect(signIn.body.user.email).toBe("admin@daftar.local");
    const cookies = signIn.headers["set-cookie"];
    expect(cookies).toBeDefined();

    const session = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", cookies)
      .expect(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.organization.slug).toBe("nomad-events");

    const memberships = await request(app.getHttpServer())
      .get("/v1/memberships")
      .set("Cookie", cookies)
      .expect(200);
    expect(memberships.body).toHaveLength(1);

    const refresh = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookies)
      .expect(201);
    expect(refresh.body.organization.slug).toBe("nomad-events");

    await request(app.getHttpServer())
      .post("/v1/auth/sign-out")
      .set("Cookie", cookies)
      .expect(201);

    const signedOut = await request(app.getHttpServer())
      .get("/v1/auth/session")
      .set("Cookie", cookies)
      .expect(200);
    expect(signedOut.body.authenticated).toBe(false);
  });

  it("switches organization and exposes capability snapshot", async () => {
    const signIn = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: "viewer@daftar.local", password: "Password123!" })
      .expect(201);

    const cookies = signIn.headers["set-cookie"];

    const capabilities = await request(app.getHttpServer())
      .get("/v1/rbac/capabilities")
      .set("Cookie", cookies)
      .expect(200);
    expect(capabilities.body.roleKey).toBe("VIEWER");
    expect(capabilities.body.permissions).toContain("shell.contacts.read");

    const organizations = await request(app.getHttpServer())
      .get("/v1/organizations")
      .set("Cookie", cookies)
      .expect(200);
    expect(organizations.body[0].slug).toBe("nomad-labs");
  });

  it("writes audit events for sign-in and organization switch", async () => {
    const signIn = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: "owner@daftar.local", password: "Password123!" })
      .expect(201);

    const cookies = signIn.headers["set-cookie"];

    await request(app.getHttpServer())
      .post("/v1/organizations/switch")
      .set("Cookie", cookies)
      .send({ orgSlug: "nomad-labs" })
      .expect(201);

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ["platform.auth.sign_in", "platform.org.switch"]
        }
      }
    });

    expect(auditEvents.map((entry) => entry.action)).toContain("platform.auth.sign_in");
    expect(auditEvents.map((entry) => entry.action)).toContain("platform.org.switch");
  });

  it("accepts invitations and creates a live session", async () => {
    const preview = await request(app.getHttpServer())
      .get("/v1/auth/invitations/invite-nomad-events-accountant")
      .expect(200);

    expect(preview.body.status).toBe("PENDING");
    expect(preview.body.organizationSlug).toBe("nomad-events");

    const acceptance = await request(app.getHttpServer())
      .post("/v1/auth/invitations/accept")
      .send({
        token: "invite-nomad-events-accountant",
        fullName: "Invited Accountant",
        password: "Password123!"
      })
      .expect(201);

    expect(acceptance.body.accepted).toBe(true);
    expect(acceptance.body.session.organization.slug).toBe("nomad-events");
  });

  it("requests and confirms password resets", async () => {
    authNotificationService.clearDeliveries();

    const resetRequest = await request(app.getHttpServer())
      .post("/v1/auth/password-reset/request")
      .send({ email: "admin@daftar.local" })
      .expect(201);

    expect(resetRequest.body.ok).toBe(true);
    expect(resetRequest.body).not.toHaveProperty("resetUrl");
    const firstDelivery = authNotificationService.listDeliveries().find(
      (delivery) => delivery.kind === "PASSWORD_RESET"
    );
    expect(firstDelivery).toBeTruthy();
    const token = firstDelivery
      ? new URL(firstDelivery.actionUrl).searchParams.get("token")
      : null;
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .post("/v1/auth/password-reset/confirm")
      .send({ token, password: "Password456!" })
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: "admin@daftar.local", password: "Password456!" })
      .expect(201);

    expect(signIn.body.user.email).toBe("admin@daftar.local");

    authNotificationService.clearDeliveries();

    const restoreRequest = await request(app.getHttpServer())
      .post("/v1/auth/password-reset/request")
      .send({ email: "admin@daftar.local" })
      .expect(201);

    expect(restoreRequest.body.ok).toBe(true);
    expect(restoreRequest.body).not.toHaveProperty("resetUrl");
    const restoreDelivery = authNotificationService.listDeliveries().find(
      (delivery) => delivery.kind === "PASSWORD_RESET"
    );
    const restoreToken = restoreDelivery
      ? new URL(restoreDelivery.actionUrl).searchParams.get("token")
      : null;
    expect(restoreToken).toBeTruthy();

    await request(app.getHttpServer())
      .post("/v1/auth/password-reset/confirm")
      .send({ token: restoreToken, password: "Password123!" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email: "admin@daftar.local", password: "Password123!" })
      .expect(201);
  });
});
