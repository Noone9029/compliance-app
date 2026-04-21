import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { enqueueComplianceSubmission } from "../../api/src/modules/compliance/compliance-queue";
import {
  buildComplianceHashes,
  buildInvoiceXml,
  buildQrPayload,
  complianceFlowForInvoiceKind,
  generateComplianceUuid,
} from "../../api/src/modules/compliance/compliance-core";
import {
  closeComplianceWorkerRuntime,
  createComplianceWorkerRuntime,
} from "./compliance-worker";

describe.sequential("worker compliance processing", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL,
      },
    },
  });
  let runtime: Awaited<ReturnType<typeof createComplianceWorkerRuntime>>;

  async function waitForStatus(invoiceId: string, status: string) {
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
      const record = await prisma.complianceDocument.findUnique({
        where: { salesInvoiceId: invoiceId },
        select: { status: true },
      });

      if (record?.status === status) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out waiting for compliance status ${status}.`);
  }

  async function seedQueuedSubmission(input: {
    invoiceId: string;
    invoiceNumber: string;
    enqueue?: boolean;
  }) {
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: input.invoiceId },
      include: {
        organization: {
          include: {
            taxDetail: true,
          },
        },
        contact: true,
      },
    });
    await prisma.reportedDocument.deleteMany({
      where: {
        salesInvoiceId: invoice.id,
      },
    });
    await prisma.complianceDocument.deleteMany({
      where: {
        salesInvoiceId: invoice.id,
      },
    });
    const onboarding = await prisma.complianceOnboarding.findFirstOrThrow({
      where: {
        organizationId: invoice.organizationId,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
      },
    });
    const uuid = generateComplianceUuid();
    const submissionFlow = complianceFlowForInvoiceKind(invoice.complianceInvoiceKind);
    const hashes = buildComplianceHashes({
      previousHash: null,
      invoiceNumber: input.invoiceNumber,
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      issueDateIso: invoice.issueDate.toISOString(),
      uuid,
      invoiceCounter: 1,
    });

    const document = await prisma.complianceDocument.create({
      data: {
        organizationId: invoice.organizationId,
        salesInvoiceId: invoice.id,
        onboardingId: onboarding.id,
        invoiceKind: invoice.complianceInvoiceKind,
        submissionFlow,
        invoiceCounter: 1,
        uuid,
        qrPayload: buildQrPayload({
          sellerName: invoice.organization.taxDetail!.legalName,
          taxNumber: invoice.organization.taxDetail!.taxNumber,
          issuedAtIso: invoice.issueDate.toISOString(),
          total: invoice.total.toString(),
          taxTotal: invoice.taxTotal.toString(),
          invoiceHash: hashes.currentHash,
        }),
        previousHash: hashes.previousHash,
        currentHash: hashes.currentHash,
        xmlContent: buildInvoiceXml({
          uuid,
          invoiceNumber: input.invoiceNumber,
          invoiceKind: invoice.complianceInvoiceKind,
          submissionFlow,
          issueDateIso: invoice.issueDate.toISOString(),
          sellerName: invoice.organization.taxDetail!.legalName,
          taxNumber: invoice.organization.taxDetail!.taxNumber,
          customerName: invoice.contact.displayName,
          invoiceCounter: 1,
          total: invoice.total.toString(),
          taxTotal: invoice.taxTotal.toString(),
          previousHash: hashes.previousHash,
        }),
        status: "QUEUED",
        lastSubmissionStatus: "QUEUED",
      },
    });

    const submission = await prisma.zatcaSubmission.create({
      data: {
        organizationId: invoice.organizationId,
        complianceDocumentId: document.id,
        flow: submissionFlow,
        status: "QUEUED",
        maxAttempts: 5,
      },
    });

    if (input.enqueue !== false) {
      await enqueueComplianceSubmission({
        submissionId: submission.id,
      });
    }

    return {
      document,
      submission,
      onboardingId: onboarding.id,
    };
  }

  beforeAll(async () => {
    execSync("pnpm --dir ../.. db:seed", {
      cwd: "E:\\Compliance App\\apps\\worker",
      stdio: "inherit",
    });
    runtime = await createComplianceWorkerRuntime();
  }, 30000);

  afterAll(async () => {
    if (runtime) {
      await closeComplianceWorkerRuntime(runtime);
    }
    await prisma.$disconnect();
  });

  it("processes queued submissions through the worker", async () => {
    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: {
        invoiceNumber: "INV-NE-0001",
      },
    });

    const seeded = await seedQueuedSubmission({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });

    await waitForStatus(invoice.id, "CLEARED");

    const stored = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: seeded.submission.id },
      include: {
        attempts: true,
      },
    });

    expect(stored.status).toBe("ACCEPTED");
    expect(stored.attempts.length).toBeGreaterThanOrEqual(1);
  });

  it("records terminal failures when the worker processes a rejected submission", async () => {
    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: {
        invoiceNumber: "INV-NL-0001",
      },
    });

    await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        invoiceNumber: "INV-NL-FAIL-REJECT-WORKER-0001",
      },
    });

    const seeded = await seedQueuedSubmission({
      invoiceId: invoice.id,
      invoiceNumber: "INV-NL-FAIL-REJECT-WORKER-0001",
    });

    await waitForStatus(invoice.id, "REJECTED");

    const stored = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: seeded.submission.id },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
      },
    });

    expect(stored.status).toBe("REJECTED");
    expect(stored.attempts[0]?.failureCategory).toBe("ZATCA_REJECTION");
  });

  it("fails queued submissions when onboarding is no longer active in the worker path", async () => {
    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: {
        invoiceNumber: "INV-NE-0001",
      },
    });
    const seeded = await seedQueuedSubmission({
      invoiceId: invoice.id,
      invoiceNumber: `${invoice.invoiceNumber}-WORKER-GUARD`,
      enqueue: false,
    });
    const onboardingBefore = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: seeded.onboardingId },
      select: {
        status: true,
        certificateStatus: true,
      },
    });

    try {
      await prisma.complianceOnboarding.update({
        where: { id: seeded.onboardingId },
        data: {
          status: "DRAFT",
          certificateStatus: "CSR_GENERATED",
        },
      });

      await enqueueComplianceSubmission({
        submissionId: seeded.submission.id,
      });
      await waitForStatus(invoice.id, "FAILED");

      const stored = await prisma.zatcaSubmission.findUniqueOrThrow({
        where: { id: seeded.submission.id },
        include: {
          attempts: {
            orderBy: { attemptNumber: "desc" },
          },
        },
      });
      const document = await prisma.complianceDocument.findUniqueOrThrow({
        where: {
          salesInvoiceId: invoice.id,
        },
        select: {
          status: true,
          lastError: true,
          failureCategory: true,
        },
      });

      expect(document.status).toBe("FAILED");
      expect(document.lastError).toBe(
        "Compliance onboarding is not active for this organization/device.",
      );
      expect(document.failureCategory).toBe("CONFIGURATION");
      expect(stored.status).toBe("FAILED");
      expect(stored.attempts[0]?.failureCategory).toBe("CONFIGURATION");
    } finally {
      await prisma.complianceOnboarding.update({
        where: { id: seeded.onboardingId },
        data: {
          status: onboardingBefore.status,
          certificateStatus: onboardingBefore.certificateStatus,
        },
      });
    }
  });
});
