import { Inject, Injectable } from "@nestjs/common";

import { loadEnv } from "@daftar/config";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class HealthService {
  private readonly env = loadEnv();
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  health() {
    return {
      status: "ok",
      app: this.env.APP_NAME,
      environment: this.env.NODE_ENV
    };
  }

  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: "ready",
      checks: {
        database: "ok",
        config: "ok"
      }
    };
  }
}
