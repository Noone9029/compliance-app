import bcrypt from "bcryptjs";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { AuthNotificationService } from "./modules/auth/auth-notification.service";

describe.sequential("Daftar Week 10 auth + team admin", () => {
  const env = loadEnv();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    }
  });
  let app: INestApplication;
  let authNotificationService: AuthNotificationService;
  let uniqueCounter = 0;

  function nextEmail(prefix: string) {
    uniqueCounter += 1;
    return `${prefix}.${uniqueCounter}@daftar.local`;
  }

  async function signIn(email: string, password = "Password123!") {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email, password })
      .expect(201);

    const cookies = response.headers["set-cookie"];
    return Array.isArray(cookies) ? cookies : [cookies].filter(Boolean);
  }

  async function switchOrg(cookies: string[], orgSlug: string) {
    await request(app.getHttpServer())
      .post("/v1/organizations/switch")
      .set("Cookie", cookies)
      .send({ orgSlug })
      .expect(201);
  }

  async function createLocalUserWithMembership(input: {
    email: string;
    fullName: string;
    organizationId: string;
    roleKey: RoleKey;
    membershipStatus?: "ACTIVE" | "INVITED" | "DISABLED";
    userStatus?: "ACTIVE" | "INVITED";
    password?: string;
  }) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: input.roleKey }
    });
    const passwordHash = await bcrypt.hash(
      input.password ?? "Password123!",
      env.AUTH_BCRYPT_ROUNDS
    );

    return prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        status: input.userStatus ?? "ACTIVE",
        authIdentities: {
          create: {
            provider: "LOCAL",
            identifier: input.email.toLowerCase(),
            secretHash: passwordHash
          }
        },
        memberships: {
          create: {
            organizationId: input.organizationId,
            roleId: role.id,
            status: input.membershipStatus ?? "ACTIVE"
          }
        }
      },
      include: {
        memberships: true
      }
    });
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    authNotificationService = app.get(AuthNotificationService);
  });

  beforeEach(() => {
    authNotificationService.clearDeliveries();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("removes debug access and keeps password reset responses neutral while recording deliveries server-side", async () => {
    await request(app.getHttpServer()).get("/v1/auth/debug").expect(404);

    const resetRequest = await request(app.getHttpServer())
      .post("/v1/auth/password-reset/request")
      .send({ email: "admin@daftar.local" })
      .expect(201);

    expect(resetRequest.body).toEqual({ ok: true });
    expect(resetRequest.body).not.toHaveProperty("resetUrl");

    const deliveries = authNotificationService.listDeliveries();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.kind).toBe("PASSWORD_RESET");
    expect(deliveries[0]?.actionUrl).toContain("/password/reset?token=");

    const unknownReset = await request(app.getHttpServer())
      .post("/v1/auth/password-reset/request")
      .send({ email: "unknown.user@daftar.local" })
      .expect(201);

    expect(unknownReset.body).toEqual({ ok: true });
    expect(authNotificationService.listDeliveries()).toHaveLength(1);

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        action: "platform.auth.password_reset_requested"
      },
      orderBy: { createdAt: "desc" },
      take: 2
    });
    expect(auditEvents).toHaveLength(2);
  });

  it("lists team members, lists invitations, and runs the invitation lifecycle with audit logging", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const team = await request(app.getHttpServer())
      .get("/v1/memberships/team")
      .set("Cookie", cookies)
      .expect(200);
    expect(team.body.some((member: { email: string }) => member.email === "owner@daftar.local")).toBe(
      true
    );

    const seededInvitations = await request(app.getHttpServer())
      .get("/v1/memberships/invitations")
      .set("Cookie", cookies)
      .expect(200);
    expect(
      seededInvitations.body.some(
        (invitation: { email: string; status: string }) =>
          invitation.email === "invited.accountant@daftar.local" &&
          ["PENDING", "ACCEPTED"].includes(invitation.status)
      )
    ).toBe(true);

    const createdInvitation = await request(app.getHttpServer())
      .post("/v1/memberships/invitations")
      .set("Cookie", cookies)
      .send({
        email: nextEmail("team.invite"),
        fullName: "Team Invite User",
        roleKey: "VIEWER"
      })
      .expect(201);

    expect(createdInvitation.body.status).toBe("PENDING");
    expect(createdInvitation.body).not.toHaveProperty("rawToken");
    expect(authNotificationService.listDeliveries()).toHaveLength(1);
    expect(authNotificationService.listDeliveries()[0]?.kind).toBe("INVITATION");

    const resentInvitation = await request(app.getHttpServer())
      .post(`/v1/memberships/invitations/${createdInvitation.body.id}/resend`)
      .set("Cookie", cookies)
      .expect(201);

    expect(resentInvitation.body.id).not.toBe(createdInvitation.body.id);
    expect(resentInvitation.body.status).toBe("PENDING");
    expect(authNotificationService.listDeliveries()).toHaveLength(2);

    const invitationLog = await request(app.getHttpServer())
      .get("/v1/memberships/invitations")
      .set("Cookie", cookies)
      .expect(200);

    const priorInvite = invitationLog.body.find(
      (invitation: { id: string }) => invitation.id === createdInvitation.body.id
    );
    expect(priorInvite?.status).toBe("REVOKED");

    const revokedInvitation = await request(app.getHttpServer())
      .post(`/v1/memberships/invitations/${resentInvitation.body.id}/revoke`)
      .set("Cookie", cookies)
      .expect(201);

    expect(revokedInvitation.body.status).toBe("REVOKED");

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "platform.membership.invitation.created",
            "platform.membership.invitation.sent",
            "platform.membership.invitation.resent",
            "platform.membership.invitation.revoked"
          ]
        }
      }
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(4);
  });

  it("refreshes the current session capability snapshot immediately after a self role change", async () => {
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const email = nextEmail("role.refresh");
    const user = await createLocalUserWithMembership({
      email,
      fullName: "Role Refresh Owner",
      organizationId: eventsOrg.id,
      roleKey: "OWNER"
    });
    const membershipId = user.memberships[0]!.id;
    const cookies = await signIn(email);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipId}/role`)
      .set("Cookie", cookies)
      .send({ roleKey: "VIEWER" })
      .expect(200);

    expect(updated.body.roleKey).toBe("VIEWER");

    const refreshed = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", cookies)
      .expect(201);

    expect(refreshed.body.membership.roleKey).toBe("VIEWER");
    expect(refreshed.body.capabilitySnapshot.permissions).toContain(
      "platform.membership.read"
    );
    expect(refreshed.body.capabilitySnapshot.permissions).not.toContain(
      "platform.membership.manage"
    );
    expect(refreshed.body.capabilitySnapshot.permissions).not.toContain(
      "shell.settings.read"
    );
  });

  it("disables and restores memberships while enforcing tenant isolation and manage permissions", async () => {
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });

    const eventUser = await createLocalUserWithMembership({
      email: nextEmail("event.member"),
      fullName: "Event Member",
      organizationId: eventsOrg.id,
      roleKey: "ACCOUNTANT"
    });
    const labsUser = await createLocalUserWithMembership({
      email: nextEmail("labs.member"),
      fullName: "Labs Member",
      organizationId: labsOrg.id,
      roleKey: "ACCOUNTANT"
    });

    const ownerCookies = await signIn("owner@daftar.local");

    const disabled = await request(app.getHttpServer())
      .post(`/v1/memberships/${eventUser.memberships[0]!.id}/disable`)
      .set("Cookie", ownerCookies)
      .expect(201);
    expect(disabled.body.status).toBe("DISABLED");

    const restored = await request(app.getHttpServer())
      .post(`/v1/memberships/${eventUser.memberships[0]!.id}/restore`)
      .set("Cookie", ownerCookies)
      .expect(201);
    expect(restored.body.status).toBe("ACTIVE");

    await request(app.getHttpServer())
      .post(`/v1/memberships/${labsUser.memberships[0]!.id}/disable`)
      .set("Cookie", ownerCookies)
      .expect(404);

    const viewerCookies = await signIn("viewer@daftar.local");

    await request(app.getHttpServer())
      .get("/v1/memberships/team")
      .set("Cookie", viewerCookies)
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/memberships/invitations")
      .set("Cookie", viewerCookies)
      .send({
        email: nextEmail("viewer.blocked"),
        fullName: "Blocked Viewer Invite",
        roleKey: "VIEWER"
      })
      .expect(403);
  });

  it("blocks demoting or disabling the last active owner in an organization", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-labs");

    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const ownerMembership = await prisma.membership.findFirstOrThrow({
      where: {
        organizationId: labsOrg.id,
        user: {
          email: "owner@daftar.local"
        }
      }
    });

    await request(app.getHttpServer())
      .patch(`/v1/memberships/${ownerMembership.id}/role`)
      .set("Cookie", cookies)
      .send({ roleKey: "ADMIN" })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/v1/memberships/${ownerMembership.id}/disable`)
      .set("Cookie", cookies)
      .expect(400);
  });
});
