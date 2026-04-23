import "reflect-metadata";

import { loadServiceEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

async function bootstrap() {
  const env = loadServiceEnv("api");
  const app = await createApp(env);
  await app.listen(env.API_PORT);
}

bootstrap();
