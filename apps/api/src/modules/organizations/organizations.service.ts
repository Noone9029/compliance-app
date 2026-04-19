import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { OrganizationSummary } from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const organizations = await this.prisma.organization.findMany({
      where: {
        memberships: {
          some: {
            userId,
            status: "ACTIVE"
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug
    }));
  }

  async switchForUser({
    userId,
    currentSessionId,
    orgSlug
  }: {
    userId: string;
    currentSessionId: string;
    orgSlug: string;
  }) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        organization: { slug: orgSlug }
      },
      include: {
        organization: true
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to that organization.");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: currentSessionId }
    });

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    await this.prisma.session.update({
      where: { id: currentSessionId },
      data: {
        organizationId: membership.organizationId
      }
    });

    return {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug
    };
  }
}
