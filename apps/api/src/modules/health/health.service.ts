import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { loadEnv } from "@daftar/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class HealthService {
  private readonly env = loadEnv();
  private readonly prisma: PrismaService;
  private readonly storage: StorageService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(StorageService) storage: StorageService
  ) {
    this.prisma = prisma;
    this.storage = storage;
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
    const storage = await this.storage.checkReadiness();
    if (storage.status !== "ok") {
      throw new ServiceUnavailableException({
        status: "not_ready",
        checks: {
          database: "ok",
          storage,
          config: "ok"
        }
      });
    }

    return {
      status: "ready",
      checks: {
        database: "ok",
        storage,
        config: "ok"
      }
    };
  }
}
