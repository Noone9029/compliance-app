import { Queue } from "bullmq";
import IORedis from "ioredis";

import { loadEnv, queueNames } from "@daftar/config";

export type ComplianceQueueJob = {
  submissionId: string;
};

export function createComplianceQueueConnection(redisUrl = loadEnv().REDIS_URL) {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });
}

export function createComplianceSubmissionQueue(
  connection = createComplianceQueueConnection(),
) {
  return new Queue<ComplianceQueueJob>(queueNames.complianceSubmissions, {
    connection,
  });
}

export async function enqueueComplianceSubmission(input: {
  submissionId: string;
  delayMs?: number;
  queue?: Queue<ComplianceQueueJob>;
}) {
  const queue = input.queue ?? createComplianceSubmissionQueue();

  try {
    await queue.add(
      "compliance.submit",
      {
        submissionId: input.submissionId,
      },
      {
        delay: input.delayMs ?? 0,
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
  } finally {
    if (!input.queue) {
      await queue.close();
    }
  }
}
