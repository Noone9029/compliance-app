import "reflect-metadata";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

async function bootstrap() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
}

bootstrap();
