import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

import { loadEnv, queueNames } from "@daftar/config";
import { enqueueComplianceSubmission } from "../../api/src/modules/compliance/compliance-queue";
import { processComplianceSubmission } from "../../api/src/modules/compliance/compliance-processor";
import {
  createComplianceTransportClient,
  fallbackComplianceTransportCredentialsFromEnv,
} from "../../api/src/modules/compliance/compliance-transport";

export async function createComplianceWorkerRuntime() {
  const env = loadEnv();
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });
  const transport = createComplianceTransportClient({
    env,
    fallbackCredentials: fallbackComplianceTransportCredentialsFromEnv(env),
  });
  const worker = new Worker<{ submissionId: string }>(
    queueNames.complianceSubmissions,
    async (job) =>
      processComplianceSubmission({
        prisma,
        submissionId: job.data.submissionId,
        transport,
        enqueueRetry: async (submissionId, delayMs) => {
          await enqueueComplianceSubmission({
            submissionId,
            delayMs,
          });
        },
      }),
    {
      connection,
    },
  );

  await worker.waitUntilReady();

  return {
    connection,
    prisma,
    worker,
  };
}

export async function closeComplianceWorkerRuntime(runtime: {
  worker: Worker;
  connection: IORedis;
  prisma: PrismaClient;
}) {
  await runtime.worker.close();
  await runtime.connection.quit();
  await runtime.prisma.$disconnect();
}
