import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import { loadEnv, queueNames } from "@daftar/config";

export type ComplianceQueueJob = {
  submissionId: string;
};

export type ComplianceDeadLetterQueueJob = {
  submissionId: string;
  reason: string;
  failureCategory: string;
  attemptNumber: number;
  failedAt: string;
};

export const complianceSubmissionJobName = "compliance.submit";

export function complianceSubmissionJobId(submissionId: string) {
  return `${complianceSubmissionJobName}-${submissionId}`;
}

export function complianceSubmissionJobOptions(input: {
  submissionId: string;
  delayMs?: number;
}): JobsOptions {
  return {
    jobId: complianceSubmissionJobId(input.submissionId),
    delay: input.delayMs ?? 0,
    removeOnComplete: 50,
    removeOnFail: 50,
  };
}

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

export function createComplianceDeadLetterQueue(
  connection = createComplianceQueueConnection(),
) {
  return new Queue<ComplianceDeadLetterQueueJob>(queueNames.complianceDeadLetter, {
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
      complianceSubmissionJobName,
      {
        submissionId: input.submissionId,
      },
      complianceSubmissionJobOptions({
        submissionId: input.submissionId,
        delayMs: input.delayMs,
      }),
    );
  } finally {
    if (!input.queue) {
      await queue.close();
    }
  }
}

export async function enqueueComplianceDeadLetter(input: {
  job: ComplianceDeadLetterQueueJob;
  queue?: Queue<ComplianceDeadLetterQueueJob>;
}) {
  const queue = input.queue ?? createComplianceDeadLetterQueue();

  try {
    await queue.add("compliance.dead-letter", input.job, {
      removeOnComplete: false,
      removeOnFail: false,
    });
  } finally {
    if (!input.queue) {
      await queue.close();
    }
  }
}
