import { Inject, Injectable } from "@nestjs/common";
import type { CapabilitySnapshot, PermissionKey, RoleKey } from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class RbacService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getCapabilitySnapshot(userId: string, organizationId: string): Promise<CapabilitySnapshot> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    if (!membership) {
      return { roleKey: null, permissions: [] };
    }

    return {
      roleKey: membership.role.key as RoleKey,
      permissions: membership.role.permissions.map(
        (entry) => entry.permission.key as PermissionKey
      )
    };
  }
}
