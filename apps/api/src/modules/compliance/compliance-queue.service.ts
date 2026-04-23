import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Queue } from "bullmq";
import type IORedis from "ioredis";

import {
  createComplianceQueueConnection,
  createComplianceSubmissionQueue,
  createComplianceDeadLetterQueue,
  enqueueComplianceDeadLetter,
  enqueueComplianceSubmission,
  type ComplianceDeadLetterQueueJob,
  type ComplianceQueueJob,
} from "./compliance-queue";

@Injectable()
export class ComplianceQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<ComplianceQueueJob>;
  private readonly deadLetterQueue: Queue<ComplianceDeadLetterQueueJob>;

  constructor() {
    this.connection = createComplianceQueueConnection();
    this.queue = createComplianceSubmissionQueue(this.connection);
    this.deadLetterQueue = createComplianceDeadLetterQueue(this.connection);
  }

  async enqueueSubmission(submissionId: string, delayMs = 0) {
    await enqueueComplianceSubmission({
      submissionId,
      delayMs,
      queue: this.queue,
    });
  }

  async enqueueDeadLetter(job: ComplianceDeadLetterQueueJob) {
    await enqueueComplianceDeadLetter({
      job,
      queue: this.deadLetterQueue,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.deadLetterQueue.close();
    await this.connection.quit();
  }
}
