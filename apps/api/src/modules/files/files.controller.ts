import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { FilesService } from "./files.service";

const fileMetadataSchema = z.object({
  originalFileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  checksumSha256: z.string().optional().nullable(),
  relatedType: z.string().optional().nullable(),
  relatedId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable()
});

const fileUploadSchema = z.object({
  relatedType: z.string().optional().nullable(),
  relatedId: z.string().optional().nullable(),
  metadata: z.string().optional().nullable()
});

function parseMetadataValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    throw new BadRequestException("Attachment metadata must be valid JSON.");
  }

  throw new BadRequestException("Attachment metadata must be an object.");
}

@Controller("v1/files")
@UseGuards(AuthenticatedGuard)
export class FilesController {
  private readonly filesService: FilesService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(FilesService) filesService: FilesService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.filesService = filesService;
    this.auditService = auditService;
  }

  @Get()
  listFiles(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("relatedType") relatedType: string | undefined,
    @Query("relatedId") relatedId: string | undefined
  ) {
    requirePermission(session, "files.read");
    return this.filesService.listFiles(session!.organization!.id, {
      relatedType: relatedType?.trim() || undefined,
      relatedId: relatedId?.trim() || undefined
    });
  }

  @Post()
  async createFileMetadata(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "files.write");
    const parsed = fileMetadataSchema.parse(body);
    const file = await this.filesService.createFileMetadata(
      session!.organization!.id,
      session!.user!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "files.metadata.create",
      targetType: "stored_file",
      targetId: file.id,
      result: "SUCCESS"
    });
    return file;
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    })
  )
  async uploadFile(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @UploadedFile()
    uploadedFile:
      | {
          originalname: string;
          mimetype: string;
          buffer: Buffer;
        }
      | undefined,
    @Body() body: unknown
  ) {
    requirePermission(session, "files.write");
    if (!uploadedFile) {
      throw new BadRequestException("A file upload is required.");
    }

    const parsed = fileUploadSchema.parse(body);
    const storedFile = await this.filesService.uploadFile(
      session!.organization!.id,
      session!.user!.id,
      {
        originalFileName: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype || "application/octet-stream",
        buffer: uploadedFile.buffer,
        relatedType: parsed.relatedType ?? null,
        relatedId: parsed.relatedId ?? null,
        metadata: parseMetadataValue(parsed.metadata)
      }
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "files.upload",
      targetType: "stored_file",
      targetId: storedFile.id,
      result: "SUCCESS"
    });
    return storedFile;
  }

  @Get(":fileId/download")
  async downloadFile(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("fileId") fileId: string,
    @Res() response: Response
  ) {
    requirePermission(session, "files.read");
    const payload = await this.filesService.getFilePayload(session!.organization!.id, fileId);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "files.download",
      targetType: "stored_file",
      targetId: payload.file.id,
      result: "SUCCESS"
    });
    response.setHeader("Content-Type", payload.file.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${payload.file.originalFileName.replace(/"/g, "")}"`
    );
    response.setHeader("Content-Length", String(payload.bytes.byteLength));
    response.send(payload.bytes);
  }

  @Delete(":fileId")
  async deleteFile(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("fileId") fileId: string
  ) {
    requirePermission(session, "files.write");
    const payload = await this.filesService.deleteFile(session!.organization!.id, fileId);
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "files.delete",
      targetType: "stored_file",
      targetId: payload.file.id,
      result: "SUCCESS"
    });
    return payload.file;
  }
}
