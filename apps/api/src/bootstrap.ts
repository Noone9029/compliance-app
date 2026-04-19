import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";

import { loadEnv } from "@daftar/config";
import { AppModule } from "./app.module";

export async function createApp(): Promise<INestApplication> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  app.enableCors({
    origin: env.APP_BASE_URL,
    credentials: true
  });
  app.use(cookieParser());

  return app;
}
