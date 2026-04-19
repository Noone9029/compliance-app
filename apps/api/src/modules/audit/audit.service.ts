import { Inject, Injectable } from "@nestjs/common";
import type { AuditReportRecord, AuditReportResponse } from "@daftar/types";
import type { AuditActorType, AuditResult, Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";

export type AuditLogInput = {
  organizationId?: string | null;
  actorType: AuditActorType;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  result?: AuditResult;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async log(event: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId ?? null,
        actorType: event.actorType,
        actorUserId: event.actorUserId ?? null,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId ?? null,
        result: event.result ?? "INFO",
        requestId: event.requestId ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }

  async getReport(
    organizationId: string,
    input: {
      search?: string;
      result?: AuditResult;
      limit?: number;
    }
  ): Promise<AuditReportResponse> {
    const where = this.buildWhereClause(organizationId, input);
    const take = input.limit ?? 100;

    const [events, totalEvents, successCount, failureCount, userEvents, systemEvents] =
      await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: {
            actorUser: {
              select: {
                fullName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take
        }),
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.count({
          where: { ...where, result: "SUCCESS" }
        }),
        this.prisma.auditLog.count({
          where: { ...where, result: "FAILURE" }
        }),
        this.prisma.auditLog.count({
          where: { ...where, actorType: "USER" }
        }),
        this.prisma.auditLog.count({
          where: { ...where, actorType: "SYSTEM" }
        })
      ]);

    return {
      metrics: {
        totalEvents,
        successCount,
        failureCount,
        userEvents,
        systemEvents
      },
      events: events.map((event) => this.mapReportRecord(event))
    };
  }

  private buildWhereClause(
    organizationId: string,
    input: {
      search?: string;
      result?: AuditResult;
    }
  ): Prisma.AuditLogWhereInput {
    if (!input.search) {
      return {
        organizationId,
        ...(input.result ? { result: input.result } : {})
      };
    }

    return {
      organizationId,
      ...(input.result ? { result: input.result } : {}),
      OR: [
        {
          action: {
            contains: input.search,
            mode: "insensitive"
          }
        },
        {
          targetType: {
            contains: input.search,
            mode: "insensitive"
          }
        },
        {
          targetId: {
            contains: input.search,
            mode: "insensitive"
          }
        },
        {
          actorUser: {
            is: {
              fullName: {
                contains: input.search,
                mode: "insensitive"
              }
            }
          }
        },
        {
          actorUser: {
            is: {
              email: {
                contains: input.search,
                mode: "insensitive"
              }
            }
          }
        }
      ]
    };
  }

  private mapReportRecord(event: {
    id: string;
    organizationId: string | null;
    actorType: AuditActorType;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    result: AuditResult;
    requestId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: unknown;
    createdAt: Date;
    actorUser: {
      fullName: string;
      email: string;
    } | null;
  }): AuditReportRecord {
    return {
      id: event.id,
      organizationId: event.organizationId,
      actorType: event.actorType,
      actorUserId: event.actorUserId,
      actorDisplayName: event.actorUser?.fullName ?? null,
      actorEmail: event.actorUser?.email ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      result: event.result,
      requestId: event.requestId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: (event.metadata as Record<string, unknown> | null) ?? null,
      createdAt: event.createdAt.toISOString()
    };
  }
}
