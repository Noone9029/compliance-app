import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { CapabilitySnapshot, OrganizationSummary, SessionSnapshot } from "@daftar/types";

import { loadEnv } from "@daftar/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { RbacService } from "../rbac/rbac.service";
import { AuthNotificationService } from "./auth-notification.service";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

@Injectable()
export class AuthService {
  private readonly env = loadEnv();
  private readonly prisma: PrismaService;
  private readonly rbacService: RbacService;
  private readonly auditService: AuditService;
  private readonly authNotificationService: AuthNotificationService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(RbacService) rbacService: RbacService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(AuthNotificationService)
    authNotificationService: AuthNotificationService
  ) {
    this.prisma = prisma;
    this.rbacService = rbacService;
    this.auditService = auditService;
    this.authNotificationService = authNotificationService;
  }

  async signIn({
    email,
    password,
    requestId,
    ipAddress,
    userAgent
  }: {
    email: string;
    password: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_identifier: {
          provider: "LOCAL",
          identifier: normalizedEmail
        }
      },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              include: {
                organization: true,
                role: true
              },
              orderBy: { createdAt: "asc" }
            }
          }
        }
      }
    });

    if (!identity || identity.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const matches = await bcrypt.compare(password, identity.secretHash);
    if (!matches) {
      await this.auditService.log({
        actorType: "SYSTEM",
        action: "platform.auth.sign_in_failed",
        targetType: "auth_identity",
        targetId: identity.id,
        result: "FAILURE",
        requestId,
        ipAddress,
        userAgent,
        metadata: { email: normalizedEmail }
      });
      throw new UnauthorizedException("Invalid credentials.");
    }

    const primaryMembership = identity.user.memberships[0];
    if (!primaryMembership) {
      throw new ForbiddenException("User does not belong to an active organization.");
    }

    return this.createSessionForUser({
      userId: identity.user.id,
      organizationId: primaryMembership.organizationId,
      requestId,
      ipAddress,
      userAgent,
      auditAction: "platform.auth.sign_in"
    });
  }

  async signOut({
    rawToken,
    requestId,
    ipAddress,
    userAgent
  }: {
    rawToken: string | undefined;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    if (!rawToken) {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) }
    });

    if (!session) {
      return;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        status: "REVOKED"
      }
    });

    await this.auditService.log({
      organizationId: session.organizationId,
      actorType: "USER",
      actorUserId: session.userId,
      action: "platform.auth.sign_out",
      targetType: "session",
      targetId: session.id,
      result: "SUCCESS",
      requestId,
      ipAddress,
      userAgent
    });
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) {
      throw new UnauthorizedException("Session cookie missing.");
    }

    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash: hashToken(rawToken)
      }
    });

    if (!session || session.status !== "ACTIVE" || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Session invalid.");
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        expiresAt: new Date(
          Date.now() + this.env.SESSION_TTL_HOURS * 60 * 60 * 1000
        ),
        lastSeenAt: new Date()
      }
    });

    return this.buildSessionSnapshot({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId
    });
  }

  async sessionSnapshot(rawToken: string | undefined): Promise<SessionSnapshot> {
    if (!rawToken) {
      return {
        authenticated: false,
        user: null,
        organization: null,
        membership: null
      };
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) }
    });

    if (!session || session.status !== "ACTIVE" || session.expiresAt < new Date()) {
      return {
        authenticated: false,
        user: null,
        organization: null,
        membership: null
      };
    }

    const snapshot = await this.buildSessionSnapshot({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId
    });

    return {
      authenticated: true,
      user: snapshot.user,
      organization: snapshot.organization,
      membership: snapshot.membership
    };
  }

  async requestPasswordReset({
    email,
    requestId,
    ipAddress,
    userAgent
  }: {
    email: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_identifier: {
          provider: "LOCAL",
          identifier: normalizedEmail
        }
      },
      include: {
        user: true
      }
    });

    if (!identity || identity.user.status === "SUSPENDED") {
      await this.auditService.log({
        actorType: "SYSTEM",
        action: "platform.auth.password_reset_requested",
        targetType: "password_reset_token",
        result: "INFO",
        requestId,
        ipAddress,
        userAgent,
        metadata: {
          email: normalizedEmail,
          deliveryAttempted: false
        }
      });
      return { ok: true as const };
    }

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: identity.userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
      }
    });

    await this.authNotificationService.sendPasswordReset({
      email: identity.user.email,
      fullName: identity.user.fullName,
      rawToken
    });

    await this.auditService.log({
      actorType: "SYSTEM",
      actorUserId: identity.userId,
      action: "platform.auth.password_reset_requested",
      targetType: "password_reset_token",
      targetId: identity.userId,
      result: "SUCCESS",
      requestId,
      ipAddress,
      userAgent,
      metadata: {
        email: normalizedEmail,
        deliveryAttempted: true
      }
    });

    return {
      ok: true as const
    };
  }

  async resetPassword({
    token,
    password,
    requestId,
    ipAddress,
    userAgent
  }: {
    token: string;
    password: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });

    if (!resetToken || resetToken.expiresAt < new Date() || resetToken.usedAt) {
      throw new BadRequestException("Reset token is invalid or expired.");
    }

    const passwordHash = await bcrypt.hash(password, this.env.AUTH_BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.authIdentity.updateMany({
        where: {
          userId: resetToken.userId,
          provider: "LOCAL"
        },
        data: {
          secretHash: passwordHash
        }
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          usedAt: new Date()
        }
      }),
      this.prisma.session.updateMany({
        where: {
          userId: resetToken.userId,
          status: "ACTIVE"
        },
        data: {
          status: "REVOKED"
        }
      })
    ]);

    await this.auditService.log({
      actorType: "USER",
      actorUserId: resetToken.userId,
      action: "platform.auth.password_reset_completed",
      targetType: "password_reset_token",
      targetId: resetToken.id,
      result: "SUCCESS",
      requestId,
      ipAddress,
      userAgent
    });

    return { ok: true };
  }

  async getInvitationPreview(rawToken: string) {
    const invitation = await this.requireInvitation(rawToken);
    const status = this.getInvitationStatus(invitation);

    return {
      email: invitation.email,
      fullName: invitation.fullName ?? invitation.membership.user.fullName,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      roleKey: invitation.membership.role.key,
      expiresAt: invitation.expiresAt.toISOString(),
      status
    };
  }

  async acceptInvitation({
    token,
    password,
    fullName,
    requestId,
    ipAddress,
    userAgent
  }: {
    token: string;
    password: string;
    fullName?: string | null;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const invitation = await this.requireInvitation(token);

    if (invitation.acceptedAt) {
      throw new BadRequestException("Invitation has already been accepted.");
    }

    if (invitation.revokedAt) {
      throw new BadRequestException("Invitation has been revoked.");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("Invitation token has expired.");
    }

    const passwordHash = await bcrypt.hash(password, this.env.AUTH_BCRYPT_ROUNDS);
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_identifier: {
          provider: "LOCAL",
          identifier: invitation.email.toLowerCase()
        }
      }
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: invitation.membership.userId },
        data: {
          fullName:
            fullName?.trim() ||
            invitation.fullName ||
            invitation.membership.user.fullName,
          status: "ACTIVE"
        }
      });

      await tx.membership.update({
        where: { id: invitation.membershipId },
        data: {
          status: "ACTIVE"
        }
      });

      await tx.invitationToken.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date()
        }
      });

      if (existingIdentity) {
        await tx.authIdentity.update({
          where: { id: existingIdentity.id },
          data: {
            identifier: invitation.email.toLowerCase()
          }
        });
        return;
      }

      await tx.authIdentity.create({
        data: {
          userId: invitation.membership.userId,
          provider: "LOCAL",
          identifier: invitation.email.toLowerCase(),
          secretHash: passwordHash
        }
      });
    });

    return this.createSessionForUser({
      userId: invitation.membership.userId,
      organizationId: invitation.organizationId,
      requestId,
      ipAddress,
      userAgent,
      auditAction: "platform.auth.invitation.accept"
    });
  }

  async resolveRequestSession(request: AuthenticatedRequest) {
    if (request.currentSession) {
      return request.currentSession;
    }

    const rawToken = (request as unknown as { cookies?: Record<string, string> }).cookies?.[
      this.env.SESSION_COOKIE_NAME
    ];

    if (!rawToken) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) }
    });

    if (!session || session.status !== "ACTIVE" || session.expiresAt < new Date()) {
      return null;
    }

    const snapshot = await this.buildSessionSnapshot({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId
    });

    request.currentSession = snapshot;
    return snapshot;
  }

  private async createSessionForUser(input: {
    userId: string;
    organizationId: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    auditAction: string;
  }) {
    const rawToken = randomBytes(48).toString("hex");
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        tokenHash: hashToken(rawToken),
        status: "ACTIVE",
        expiresAt: new Date(
          Date.now() + this.env.SESSION_TTL_HOURS * 60 * 60 * 1000
        ),
        lastSeenAt: new Date(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });

    await this.auditService.log({
      organizationId: input.organizationId,
      actorType: "USER",
      actorUserId: input.userId,
      action: input.auditAction,
      targetType: "session",
      targetId: session.id,
      result: "SUCCESS",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return {
      token: rawToken,
      session: await this.buildSessionSnapshot({
        sessionId: session.id,
        userId: input.userId,
        organizationId: input.organizationId
      })
    };
  }

  private async requireInvitation(rawToken: string) {
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        organization: true,
        membership: {
          include: {
            role: true,
            user: true
          }
        }
      }
    });

    if (!invitation) {
      throw new NotFoundException("Invitation not found.");
    }

    return invitation;
  }

  private getInvitationStatus(invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  }) {
    if (invitation.acceptedAt) {
      return "ACCEPTED" as const;
    }

    if (invitation.revokedAt) {
      return "REVOKED" as const;
    }

    if (invitation.expiresAt < new Date()) {
      return "EXPIRED" as const;
    }

    return "PENDING" as const;
  }

  private async buildSessionSnapshot({
    sessionId,
    userId,
    organizationId
  }: {
    sessionId: string;
    userId: string;
    organizationId?: string | null;
  }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId }
    });

    let organization: OrganizationSummary | null = null;
    let membership: SessionSnapshot["membership"] = null;
    let capabilitySnapshot: CapabilitySnapshot = { roleKey: null, permissions: [] };

    if (organizationId) {
      const foundMembership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId
          }
        },
        include: {
          organization: true,
          role: true
        }
      });

      if (foundMembership && foundMembership.status === "ACTIVE") {
        organization = {
          id: foundMembership.organization.id,
          name: foundMembership.organization.name,
          slug: foundMembership.organization.slug
        };
        membership = {
          id: foundMembership.id,
          roleKey: foundMembership.role.key,
          status: foundMembership.status
        };
        capabilitySnapshot = await this.rbacService.getCapabilitySnapshot(
          userId,
          organizationId
        );
      }
    }

    return {
      id: sessionId,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName
      },
      organization,
      membership,
      capabilitySnapshot
    };
  }
}
