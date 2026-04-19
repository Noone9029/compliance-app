import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ManualJournalDetail,
  ManualJournalLineRecord,
  ManualJournalSummary,
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

function money(
  value: { toString(): string } | string | number | null | undefined,
) {
  return Number(value ?? 0).toFixed(2);
}

type JournalLineInput = {
  accountId: string;
  description?: string | null;
  debit: string;
  credit: string;
};

type JournalInput = {
  journalNumber?: string | null;
  reference?: string | null;
  entryDate: string;
  memo?: string | null;
  lines: JournalLineInput[];
};

@Injectable()
export class JournalsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listJournals(organizationId: string): Promise<ManualJournalSummary[]> {
    const journals = await this.prisma.journalEntry.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { lines: true },
        },
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    });

    return journals.map((journal) => this.mapSummary(journal));
  }

  async getJournal(
    organizationId: string,
    journalId: string,
  ): Promise<ManualJournalDetail> {
    const journal = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, organizationId },
      include: {
        lines: {
          include: {
            account: true,
          },
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: { lines: true },
        },
      },
    });

    if (!journal) {
      throw new NotFoundException("Manual journal not found.");
    }

    return this.mapDetail(journal);
  }

  async createJournal(
    organizationId: string,
    input: JournalInput,
  ): Promise<ManualJournalDetail> {
    const prepared = await this.prepareInput(organizationId, input);
    const journalNumber =
      input.journalNumber?.trim() ||
      (await this.nextJournalNumber(organizationId));
    await this.ensureJournalNumberAvailable(organizationId, journalNumber);

    const journal = await this.prisma.journalEntry.create({
      data: {
        organizationId,
        journalNumber,
        reference: input.reference?.trim() || null,
        entryDate: new Date(input.entryDate),
        memo: input.memo?.trim() || null,
        totalDebit: prepared.totalDebit,
        totalCredit: prepared.totalCredit,
        lines: {
          create: prepared.lines.map((line, index) => ({
            accountId: line.accountId,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            sortOrder: index,
          })),
        },
      },
    });

    return this.getJournal(organizationId, journal.id);
  }

  async updateJournal(
    organizationId: string,
    journalId: string,
    input: JournalInput,
  ): Promise<ManualJournalDetail> {
    const existing = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Manual journal not found.");
    }

    const prepared = await this.prepareInput(organizationId, input);
    const journalNumber = input.journalNumber?.trim() || existing.journalNumber;
    await this.ensureJournalNumberAvailable(
      organizationId,
      journalNumber,
      journalId,
    );

    await this.prisma.journalEntry.update({
      where: { id: journalId },
      data: {
        journalNumber,
        reference: input.reference?.trim() || null,
        entryDate: new Date(input.entryDate),
        memo: input.memo?.trim() || null,
        totalDebit: prepared.totalDebit,
        totalCredit: prepared.totalCredit,
        lines: {
          deleteMany: {},
          create: prepared.lines.map((line, index) => ({
            accountId: line.accountId,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            sortOrder: index,
          })),
        },
      },
    });

    return this.getJournal(organizationId, journalId);
  }

  private async prepareInput(organizationId: string, input: JournalInput) {
    if (input.lines.length < 2) {
      throw new BadRequestException(
        "Manual journals require at least two lines.",
      );
    }

    const normalizedLines = input.lines.map((line) => {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (
        !Number.isFinite(debit) ||
        debit < 0 ||
        !Number.isFinite(credit) ||
        credit < 0
      ) {
        throw new BadRequestException(
          "Journal amounts must be non-negative numbers.",
        );
      }

      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new BadRequestException(
          "Each journal line must contain either a debit or a credit amount.",
        );
      }

      return {
        accountId: line.accountId,
        description: line.description?.trim() || null,
        debit: money(debit),
        credit: money(credit),
      };
    });

    const accountIds = [
      ...new Set(normalizedLines.map((line) => line.accountId)),
    ];
    const accounts = await this.prisma.account.findMany({
      where: {
        organizationId,
        id: { in: accountIds },
      },
    });

    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        "One or more journal lines reference an invalid account.",
      );
    }

    const totalDebit = normalizedLines.reduce(
      (sum, line) => sum + Number(line.debit),
      0,
    );
    const totalCredit = normalizedLines.reduce(
      (sum, line) => sum + Number(line.credit),
      0,
    );

    if (totalDebit <= 0 || totalCredit <= 0) {
      throw new BadRequestException(
        "Manual journals must contain a positive total.",
      );
    }

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException("Total debit must equal total credit.");
    }

    return {
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
      lines: normalizedLines,
    };
  }

  private mapSummary(journal: {
    id: string;
    organizationId: string;
    journalNumber: string;
    reference: string | null;
    entryDate: Date;
    memo: string | null;
    totalDebit: { toString(): string };
    totalCredit: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
    _count: { lines: number };
  }): ManualJournalSummary {
    return {
      id: journal.id,
      organizationId: journal.organizationId,
      journalNumber: journal.journalNumber,
      reference: journal.reference,
      entryDate: journal.entryDate.toISOString(),
      memo: journal.memo,
      totalDebit: money(journal.totalDebit),
      totalCredit: money(journal.totalCredit),
      lineCount: journal._count.lines,
      createdAt: journal.createdAt.toISOString(),
      updatedAt: journal.updatedAt.toISOString(),
    };
  }

  private mapDetail(journal: {
    id: string;
    organizationId: string;
    journalNumber: string;
    reference: string | null;
    entryDate: Date;
    memo: string | null;
    totalDebit: { toString(): string };
    totalCredit: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
    _count: { lines: number };
    lines: {
      id: string;
      journalEntryId: string;
      accountId: string;
      description: string | null;
      debit: { toString(): string };
      credit: { toString(): string };
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
      account: {
        code: string;
        name: string;
        type: ManualJournalLineRecord["accountType"];
      };
    }[];
  }): ManualJournalDetail {
    return {
      ...this.mapSummary(journal),
      lines: journal.lines.map((line) => ({
        id: line.id,
        journalEntryId: line.journalEntryId,
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountType: line.account.type,
        description: line.description,
        debit: money(line.debit),
        credit: money(line.credit),
        sortOrder: line.sortOrder,
        createdAt: line.createdAt.toISOString(),
        updatedAt: line.updatedAt.toISOString(),
      })),
    };
  }

  private async nextJournalNumber(organizationId: string) {
    const count = await this.prisma.journalEntry.count({
      where: { organizationId },
    });

    return `MJ-${String(count + 1).padStart(4, "0")}`;
  }

  private async ensureJournalNumberAvailable(
    organizationId: string,
    journalNumber: string,
    excludeJournalId?: string,
  ) {
    const existing = await this.prisma.journalEntry.findFirst({
      where: {
        organizationId,
        journalNumber,
        ...(excludeJournalId ? { id: { not: excludeJournalId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException(
        "Journal number already exists for this organization.",
      );
    }
  }
}
