import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";
import { raw } from "express";

import { loadEnv, type DaftarEnv } from "@daftar/config";
import { AppModule } from "./app.module";

export async function createApp(env: DaftarEnv = loadEnv()): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  app.enableCors({
    origin: env.APP_BASE_URL,
    credentials: true
  });
  app.use("/v1/billing/webhooks/stripe", raw({ type: "application/json" }));
  app.use(cookieParser());

  return app;
}
