import { describe, expect, it, vi } from "vitest";

import {
  complianceSubmissionJobId,
  complianceSubmissionJobName,
  complianceSubmissionJobOptions,
  enqueueComplianceDeadLetter,
  enqueueComplianceSubmission,
  type ComplianceQueueJob,
} from "./compliance-queue";

function createFakeQueue() {
  const jobs = new Map<string, { name: string; data: ComplianceQueueJob; options: unknown }>();

  return {
    jobs,
    add: vi.fn(
      async (
        name: string,
        data: ComplianceQueueJob,
        options: { jobId?: string },
      ) => {
        const key = options.jobId ?? `${name}:${jobs.size}`;
        if (!jobs.has(key)) {
          jobs.set(key, { name, data, options });
        }
        return jobs.get(key);
      },
    ),
  };
}

describe("compliance queue job options", () => {
  it("uses a deterministic BullMQ job id for submission jobs", () => {
    expect(complianceSubmissionJobId("sub_123")).toBe("compliance.submit-sub_123");
    expect(
      complianceSubmissionJobOptions({
        submissionId: "sub_123",
      }),
    ).toMatchObject({
      jobId: "compliance.submit-sub_123",
      delay: 0,
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  });

  it("keeps duplicate enqueue calls for the same submission on one active job id", async () => {
    const queue = createFakeQueue();

    await enqueueComplianceSubmission({
      submissionId: "sub_duplicate",
      queue: queue as never,
    });
    await enqueueComplianceSubmission({
      submissionId: "sub_duplicate",
      queue: queue as never,
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs.get("compliance.submit-sub_duplicate")).toMatchObject({
      name: complianceSubmissionJobName,
      data: {
        submissionId: "sub_duplicate",
      },
    });
  });

  it("keeps the expected submission id and deterministic job id for delayed retry enqueue", async () => {
    const queue = createFakeQueue();

    await enqueueComplianceSubmission({
      submissionId: "sub_delayed",
      delayMs: 30_000,
      queue: queue as never,
    });

    expect(queue.jobs.get("compliance.submit-sub_delayed")).toMatchObject({
      name: complianceSubmissionJobName,
      data: {
        submissionId: "sub_delayed",
      },
      options: {
        jobId: "compliance.submit-sub_delayed",
        delay: 30_000,
      },
    });
  });

  it("leaves dead-letter enqueue behavior unchanged", async () => {
    const queue = {
      add: vi.fn().mockResolvedValue(null),
    };

    await enqueueComplianceDeadLetter({
      job: {
        submissionId: "sub_dead",
        reason: "Terminal validation failure.",
        failureCategory: "VALIDATION",
        attemptNumber: 3,
        failedAt: "2026-04-29T00:00:00.000Z",
      },
      queue: queue as never,
    });

    expect(queue.add).toHaveBeenCalledWith(
      "compliance.dead-letter",
      {
        submissionId: "sub_dead",
        reason: "Terminal validation failure.",
        failureCategory: "VALIDATION",
        attemptNumber: 3,
        failedAt: "2026-04-29T00:00:00.000Z",
      },
      {
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
  });
});
