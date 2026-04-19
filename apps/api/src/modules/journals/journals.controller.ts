import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { JournalsService } from "./journals.service";

const journalSchema = z.object({
  journalNumber: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  entryDate: z.string().min(1),
  memo: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1),
        description: z.string().optional().nullable(),
        debit: z.string().min(1),
        credit: z.string().min(1),
      }),
    )
    .min(2),
});

@Controller("v1/journals")
@UseGuards(AuthenticatedGuard)
export class JournalsController {
  private readonly journalsService: JournalsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(JournalsService) journalsService: JournalsService,
    @Inject(AuditService) auditService: AuditService,
  ) {
    this.journalsService = journalsService;
    this.auditService = auditService;
  }

  @Get()
  listJournals(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
  ) {
    requirePermission(session, "journals.read");
    return this.journalsService.listJournals(session!.organization!.id);
  }

  @Get(":journalId")
  getJournal(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("journalId") journalId: string,
  ) {
    requirePermission(session, "journals.read");
    return this.journalsService.getJournal(
      session!.organization!.id,
      journalId,
    );
  }

  @Post()
  async createJournal(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown,
  ) {
    requirePermission(session, "journals.write");
    const parsed = journalSchema.parse(body);
    const journal = await this.journalsService.createJournal(
      session!.organization!.id,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "journals.entry.create",
      targetType: "journal_entry",
      targetId: journal.id,
      result: "SUCCESS",
    });
    return journal;
  }

  @Patch(":journalId")
  async updateJournal(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("journalId") journalId: string,
    @Body() body: unknown,
  ) {
    requirePermission(session, "journals.write");
    const parsed = journalSchema.parse(body);
    const journal = await this.journalsService.updateJournal(
      session!.organization!.id,
      journalId,
      parsed,
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "journals.entry.update",
      targetType: "journal_entry",
      targetId: journal.id,
      result: "SUCCESS",
    });
    return journal;
  }
}
