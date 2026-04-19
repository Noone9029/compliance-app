import { queueNames } from "@daftar/config";

import {
  closeComplianceWorkerRuntime,
  createComplianceWorkerRuntime,
} from "./compliance-worker";

async function bootstrap() {
  const runtime = await createComplianceWorkerRuntime();

  const shutdown = async () => {
    await closeComplianceWorkerRuntime(runtime);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(
    JSON.stringify({
      app: "daftar-worker",
      status: "ready",
      queue: queueNames.complianceSubmissions,
    }),
  );
}

bootstrap();
