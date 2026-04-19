import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type {
  CreateInvitationInput,
  MembershipSummary,
  RoleKey,
  TeamInvitationRecord,
  TeamInvitationStatus,
  TeamMemberRecord,
  UpdateMembershipRoleInput
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthNotificationService } from "../auth/auth-notification.service";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

@Injectable()
export class MembershipsService {
  private readonly prisma: PrismaService;
  private readonly auditService: AuditService;
  private readonly authNotificationService: AuthNotificationService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(AuditService) auditService: AuditService,
    @Inject(AuthNotificationService)
    authNotificationService: AuthNotificationService
  ) {
    this.prisma = prisma;
    this.auditService = auditService;
    this.authNotificationService = authNotificationService;
  }

  async listForUser(userId: string): Promise<MembershipSummary[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true, role: true },
      orderBy: { createdAt: "asc" }
    });

    return memberships.map((membership) => ({
      id: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
      roleKey: membership.role.key,
      status: membership.status
    }));
  }

  async listTeamMembers(
    organizationId: string,
    currentUserId: string
  ): Promise<TeamMemberRecord[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        role: true,
        user: true
      },
      orderBy: [{ createdAt: "asc" }]
    });

    const activeOwnerCount = memberships.filter(
      (membership) =>
        membership.status === "ACTIVE" && membership.role.key === "OWNER"
    ).length;

    const statusOrder = {
      ACTIVE: 0,
      INVITED: 1,
      DISABLED: 2
    } as const;

    return memberships
      .map((membership) => {
        const isLastActiveOwner =
          membership.status === "ACTIVE" &&
          membership.role.key === "OWNER" &&
          activeOwnerCount === 1;

        return {
          id: membership.id,
          userId: membership.userId,
          fullName: membership.user.fullName,
          email: membership.user.email,
          roleKey: membership.role.key,
          status: membership.status,
          createdAt: membership.createdAt.toISOString(),
          updatedAt: membership.updatedAt.toISOString(),
          isCurrentUser: membership.userId === currentUserId,
          isLastActiveOwner
        };
      })
      .sort((left, right) => {
        const statusComparison =
          statusOrder[left.status] - statusOrder[right.status];
        if (statusComparison !== 0) {
          return statusComparison;
        }

        if (left.roleKey === "OWNER" && right.roleKey !== "OWNER") {
          return -1;
        }

        if (left.roleKey !== "OWNER" && right.roleKey === "OWNER") {
          return 1;
        }

        return left.fullName.localeCompare(right.fullName);
      });
  }

  async listInvitations(organizationId: string): Promise<TeamInvitationRecord[]> {
    const invitations = await this.prisma.invitationToken.findMany({
      where: { organizationId },
      include: {
        membership: {
          include: {
            role: true,
            user: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return invitations.map((invitation) => this.mapInvitation(invitation));
  }

  async createInvitation(
    organizationId: string,
    actorUserId: string,
    input: CreateInvitationInput,
    auditContext?: AuditContext
  ): Promise<TeamInvitationRecord> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedFullName = input.fullName?.trim() || null;
    const role = await this.getRoleOrThrow(input.roleKey);
    const expiry = this.buildInvitationExpiry();

    const created = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId }
      });
      let user = await tx.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (user?.status === "SUSPENDED") {
        throw new BadRequestException(
          "This user is suspended and cannot be invited."
        );
      }

      let membership = user
        ? await tx.membership.findUnique({
            where: {
              userId_organizationId: {
                userId: user.id,
                organizationId
              }
            },
            include: {
              role: true,
              user: true,
              invitationTokens: {
                orderBy: { createdAt: "desc" }
              }
            }
          })
        : null;

      if (membership?.status === "ACTIVE") {
        throw new BadRequestException(
          "This user already has an active membership in the organization."
        );
      }

      if (membership?.status === "DISABLED") {
        throw new BadRequestException(
          "This membership is disabled. Restore it instead of creating a new invitation."
        );
      }

      if (
        membership &&
        membership.invitationTokens.some(
          (invitation) => this.getInvitationStatus(invitation) === "PENDING"
        )
      ) {
        throw new BadRequestException(
          "A pending invitation already exists for this member. Resend it instead."
        );
      }

      if (!user) {
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            fullName: normalizedFullName ?? normalizedEmail,
            status: "INVITED"
          }
        });
      } else if (normalizedFullName && user.fullName !== normalizedFullName) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { fullName: normalizedFullName }
        });
      }

      if (!membership) {
        membership = await tx.membership.create({
          data: {
            userId: user.id,
            organizationId,
            roleId: role.id,
            status: "INVITED"
          },
          include: {
            role: true,
            user: true,
            invitationTokens: {
              orderBy: { createdAt: "desc" }
            }
          }
        });
      } else if (membership.roleId !== role.id) {
        membership = await tx.membership.update({
          where: { id: membership.id },
          data: { roleId: role.id },
          include: {
            role: true,
            user: true,
            invitationTokens: {
              orderBy: { createdAt: "desc" }
            }
          }
        });
      }

      await tx.invitationToken.updateMany({
        where: {
          membershipId: membership.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gte: new Date()
          }
        },
        data: {
          revokedAt: new Date()
        }
      });

      const rawToken = randomBytes(32).toString("hex");
      const invitation = await tx.invitationToken.create({
        data: {
          organizationId,
          membershipId: membership.id,
          email: normalizedEmail,
          fullName: normalizedFullName ?? membership.user.fullName,
          tokenHash: hashToken(rawToken),
          expiresAt: expiry
        },
        include: {
          membership: {
            include: {
              role: true,
              user: true
            }
          }
        }
      });

      return {
        rawToken,
        organizationName: organization.name,
        invitation
      };
    });

    await this.authNotificationService.sendInvitation({
      organizationId,
      organizationName: created.organizationName,
      email: created.invitation.email,
      fullName:
        created.invitation.fullName ??
        created.invitation.membership.user.fullName,
      roleKey: created.invitation.membership.role.key,
      rawToken: created.rawToken
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.invitation.created",
      targetType: "invitation_token",
      targetId: created.invitation.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: created.invitation.email,
        roleKey: created.invitation.membership.role.key
      }
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.invitation.sent",
      targetType: "invitation_token",
      targetId: created.invitation.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: created.invitation.email
      }
    });

    return this.mapInvitation(created.invitation);
  }

  async resendInvitation(
    organizationId: string,
    actorUserId: string,
    invitationId: string,
    auditContext?: AuditContext
  ): Promise<TeamInvitationRecord> {
    const invitation = await this.requireInvitation(organizationId, invitationId);

    if (invitation.acceptedAt) {
      throw new BadRequestException(
        "Accepted invitations cannot be resent."
      );
    }

    if (invitation.membership.status !== "INVITED") {
      throw new BadRequestException(
        "Only invited memberships can receive a new invitation."
      );
    }

    const resent = await this.prisma.$transaction(async (tx) => {
      await tx.invitationToken.updateMany({
        where: {
          membershipId: invitation.membershipId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gte: new Date()
          }
        },
        data: {
          revokedAt: new Date()
        }
      });

      const rawToken = randomBytes(32).toString("hex");
      const nextInvitation = await tx.invitationToken.create({
        data: {
          organizationId,
          membershipId: invitation.membershipId,
          email: invitation.email,
          fullName: invitation.fullName ?? invitation.membership.user.fullName,
          tokenHash: hashToken(rawToken),
          expiresAt: this.buildInvitationExpiry()
        },
        include: {
          membership: {
            include: {
              role: true,
              user: true
            }
          }
        }
      });

      return {
        rawToken,
        invitation: nextInvitation
      };
    });

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId }
    });

    await this.authNotificationService.sendInvitation({
      organizationId,
      organizationName: organization.name,
      email: resent.invitation.email,
      fullName:
        resent.invitation.fullName ?? resent.invitation.membership.user.fullName,
      roleKey: resent.invitation.membership.role.key,
      rawToken: resent.rawToken
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.invitation.resent",
      targetType: "invitation_token",
      targetId: resent.invitation.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: resent.invitation.email
      }
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.invitation.sent",
      targetType: "invitation_token",
      targetId: resent.invitation.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: resent.invitation.email
      }
    });

    return this.mapInvitation(resent.invitation);
  }

  async revokeInvitation(
    organizationId: string,
    actorUserId: string,
    invitationId: string,
    auditContext?: AuditContext
  ): Promise<TeamInvitationRecord> {
    const invitation = await this.requireInvitation(organizationId, invitationId);

    if (invitation.acceptedAt) {
      throw new BadRequestException(
        "Accepted invitations cannot be revoked."
      );
    }

    const revoked =
      invitation.revokedAt != null
        ? invitation
        : await this.prisma.invitationToken.update({
            where: { id: invitation.id },
            data: {
              revokedAt: new Date()
            },
            include: {
              membership: {
                include: {
                  role: true,
                  user: true
                }
              }
            }
          });

    if (!invitation.revokedAt) {
      await this.auditService.log({
        organizationId,
        actorType: "USER",
        actorUserId,
        action: "platform.membership.invitation.revoked",
        targetType: "invitation_token",
        targetId: invitation.id,
        result: "SUCCESS",
        ...auditContext,
        metadata: {
          email: invitation.email
        }
      });
    }

    return this.mapInvitation(revoked);
  }

  async updateRole(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
    input: UpdateMembershipRoleInput,
    auditContext?: AuditContext
  ): Promise<TeamMemberRecord> {
    const membership = await this.requireMembership(organizationId, membershipId);
    const role = await this.getRoleOrThrow(input.roleKey);

    if (membership.roleId === role.id) {
      return this.mapMember(membership, actorUserId, await this.countActiveOwners(organizationId));
    }

    if (
      membership.status === "ACTIVE" &&
      membership.role.key === "OWNER" &&
      role.key !== "OWNER"
    ) {
      await this.assertAnotherActiveOwnerExists(organizationId, membership.id);
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        roleId: role.id
      },
      include: {
        role: true,
        user: true
      }
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.role_changed",
      targetType: "membership",
      targetId: updated.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: updated.user.email,
        fromRoleKey: membership.role.key,
        toRoleKey: updated.role.key
      }
    });

    return this.mapMember(
      updated,
      actorUserId,
      await this.countActiveOwners(organizationId)
    );
  }

  async disableMembership(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
    auditContext?: AuditContext
  ): Promise<TeamMemberRecord> {
    const membership = await this.requireMembership(organizationId, membershipId);

    if (membership.status !== "ACTIVE") {
      throw new BadRequestException(
        "Only active memberships can be disabled."
      );
    }

    if (membership.role.key === "OWNER") {
      await this.assertAnotherActiveOwnerExists(organizationId, membership.id);
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: "DISABLED"
      },
      include: {
        role: true,
        user: true
      }
    });

    await this.reassignOrRevokeSessionsForUser(updated.userId, organizationId);

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.disabled",
      targetType: "membership",
      targetId: updated.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: updated.user.email
      }
    });

    return this.mapMember(
      updated,
      actorUserId,
      await this.countActiveOwners(organizationId)
    );
  }

  async restoreMembership(
    organizationId: string,
    actorUserId: string,
    membershipId: string,
    auditContext?: AuditContext
  ): Promise<TeamMemberRecord> {
    const membership = await this.requireMembership(organizationId, membershipId);

    if (membership.status !== "DISABLED") {
      throw new BadRequestException(
        "Only disabled memberships can be restored."
      );
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: "ACTIVE"
      },
      include: {
        role: true,
        user: true
      }
    });

    await this.auditService.log({
      organizationId,
      actorType: "USER",
      actorUserId,
      action: "platform.membership.restored",
      targetType: "membership",
      targetId: updated.id,
      result: "SUCCESS",
      ...auditContext,
      metadata: {
        email: updated.user.email
      }
    });

    return this.mapMember(
      updated,
      actorUserId,
      await this.countActiveOwners(organizationId)
    );
  }

  private async requireMembership(organizationId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId
      },
      include: {
        role: true,
        user: true
      }
    });

    if (!membership) {
      throw new NotFoundException("Membership not found.");
    }

    return membership;
  }

  private async requireInvitation(organizationId: string, invitationId: string) {
    const invitation = await this.prisma.invitationToken.findFirst({
      where: {
        id: invitationId,
        organizationId
      },
      include: {
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

  private async getRoleOrThrow(roleKey: RoleKey) {
    const role = await this.prisma.role.findUnique({
      where: { key: roleKey }
    });

    if (!role) {
      throw new NotFoundException("Role not found.");
    }

    return role;
  }

  private async assertAnotherActiveOwnerExists(
    organizationId: string,
    membershipIdToExclude: string
  ) {
    const activeOwnerCount = await this.prisma.membership.count({
      where: {
        organizationId,
        status: "ACTIVE",
        role: {
          key: "OWNER"
        },
        id: {
          not: membershipIdToExclude
        }
      }
    });

    if (activeOwnerCount === 0) {
      throw new BadRequestException(
        "At least one active owner must remain in the organization."
      );
    }
  }

  private async countActiveOwners(organizationId: string) {
    return this.prisma.membership.count({
      where: {
        organizationId,
        status: "ACTIVE",
        role: {
          key: "OWNER"
        }
      }
    });
  }

  private async reassignOrRevokeSessionsForUser(
    userId: string,
    currentOrganizationId: string
  ) {
    const fallbackMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "asc" }
    });

    if (fallbackMembership) {
      await this.prisma.session.updateMany({
        where: {
          userId,
          organizationId: currentOrganizationId,
          status: "ACTIVE"
        },
        data: {
          organizationId: fallbackMembership.organizationId
        }
      });
      return;
    }

    await this.prisma.session.updateMany({
      where: {
        userId,
        organizationId: currentOrganizationId,
        status: "ACTIVE"
      },
      data: {
        status: "REVOKED"
      }
    });
  }

  private buildInvitationExpiry() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  private getInvitationStatus(invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  }): TeamInvitationStatus {
    if (invitation.acceptedAt) {
      return "ACCEPTED";
    }

    if (invitation.revokedAt) {
      return "REVOKED";
    }

    if (invitation.expiresAt < new Date()) {
      return "EXPIRED";
    }

    return "PENDING";
  }

  private mapMember(
    membership: {
      id: string;
      userId: string;
      status: "ACTIVE" | "INVITED" | "DISABLED";
      createdAt: Date;
      updatedAt: Date;
      role: { key: RoleKey };
      user: { fullName: string; email: string };
    },
    currentUserId: string,
    activeOwnerCount: number
  ): TeamMemberRecord {
    const isLastActiveOwner =
      membership.status === "ACTIVE" &&
      membership.role.key === "OWNER" &&
      activeOwnerCount === 1;

    return {
      id: membership.id,
      userId: membership.userId,
      fullName: membership.user.fullName,
      email: membership.user.email,
      roleKey: membership.role.key,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
      isCurrentUser: membership.userId === currentUserId,
      isLastActiveOwner
    };
  }

  private mapInvitation(invitation: {
    id: string;
    membershipId: string;
    email: string;
    fullName: string | null;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    membership: {
      role: { key: RoleKey };
      user: { fullName: string };
    };
  }): TeamInvitationRecord {
    return {
      id: invitation.id,
      membershipId: invitation.membershipId,
      email: invitation.email,
      fullName: invitation.fullName ?? invitation.membership.user.fullName,
      roleKey: invitation.membership.role.key,
      status: this.getInvitationStatus(invitation),
      expiresAt: invitation.expiresAt.toISOString(),
      acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString()
    };
  }
}

type AuditContext = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};
