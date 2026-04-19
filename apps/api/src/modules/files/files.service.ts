import { createHash } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type { StoredFileRecord } from "@daftar/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { FileStorageService } from "./file-storage.service";
import { mapStoredFileRecord } from "./file-record";

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

@Injectable()
export class FilesService {
  private readonly prisma: PrismaService;
  private readonly fileStorage: FileStorageService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(FileStorageService) fileStorage: FileStorageService
  ) {
    this.prisma = prisma;
    this.fileStorage = fileStorage;
  }

  async listFiles(
    organizationId: string,
    options: {
      relatedType?: string;
      relatedId?: string;
    }
  ): Promise<StoredFileRecord[]> {
    if (options.relatedType || options.relatedId) {
      await this.ensureAttachmentTarget(
        organizationId,
        options.relatedType ?? null,
        options.relatedId ?? null,
        "read"
      );
    }

    const files = await this.prisma.storedFile.findMany({
      where: {
        organizationId,
        ...(options.relatedType ? { relatedType: options.relatedType } : {}),
        ...(options.relatedId ? { relatedId: options.relatedId } : {})
      },
      orderBy: { createdAt: "desc" }
    });

    return files.map((file) => mapStoredFileRecord(file));
  }

  async createFileMetadata(
    organizationId: string,
    uploadedByUserId: string,
    input: {
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      checksumSha256?: string | null;
      relatedType?: string | null;
      relatedId?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<StoredFileRecord> {
    await this.ensureAttachmentTarget(
      organizationId,
      input.relatedType ?? null,
      input.relatedId ?? null,
      "write"
    );

    const file = await this.createStoredFileRecord(organizationId, uploadedByUserId, {
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256 ?? null,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      metadata: input.metadata ?? null
    });

    return mapStoredFileRecord(file);
  }

  async uploadFile(
    organizationId: string,
    uploadedByUserId: string,
    input: {
      originalFileName: string;
      mimeType: string;
      buffer: Buffer;
      relatedType?: string | null;
      relatedId?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<StoredFileRecord> {
    await this.ensureAttachmentTarget(
      organizationId,
      input.relatedType ?? null,
      input.relatedId ?? null,
      "write"
    );

    if (input.buffer.byteLength <= 0) {
      throw new BadRequestException("Uploaded file is empty.");
    }

    const checksumSha256 = createHash("sha256").update(input.buffer).digest("hex");
    const fileName = sanitizeFileName(input.originalFileName) || "attachment.bin";
    const objectKey = `${organizationId}/${Date.now()}-${fileName}`;

    await this.fileStorage.putObject(objectKey, input.buffer);

    try {
      const file = await this.createStoredFileRecord(organizationId, uploadedByUserId, {
        objectKey,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.byteLength,
        checksumSha256,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        metadata: input.metadata ?? null
      });

      return mapStoredFileRecord(file);
    } catch (error) {
      await this.fileStorage.deleteObject(objectKey);
      throw error;
    }
  }

  async getFilePayload(organizationId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        organizationId
      }
    });

    if (!file) {
      throw new NotFoundException("File not found.");
    }

    await this.ensureAttachmentTarget(
      organizationId,
      file.relatedType,
      file.relatedId,
      "read"
    );

    const bytes = await this.fileStorage.getObject(file.objectKey);
    return {
      file: mapStoredFileRecord(file),
      bytes
    };
  }

  async deleteFile(organizationId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        organizationId
      }
    });

    if (!file) {
      throw new NotFoundException("File not found.");
    }

    await this.ensureAttachmentTarget(
      organizationId,
      file.relatedType,
      file.relatedId,
      "delete"
    );

    await this.prisma.storedFile.delete({
      where: { id: file.id }
    });
    await this.fileStorage.deleteObject(file.objectKey);

    return {
      file: mapStoredFileRecord(file)
    };
  }

  private async createStoredFileRecord(
    organizationId: string,
    uploadedByUserId: string,
    input: {
      objectKey?: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      checksumSha256: string | null;
      relatedType: string | null;
      relatedId: string | null;
      metadata: Record<string, unknown> | null;
    }
  ) {
    const fileName = sanitizeFileName(input.originalFileName) || "attachment.bin";
    const objectKey =
      input.objectKey ?? `${organizationId}/${Date.now()}-${fileName}`;

    return this.prisma.storedFile.create({
      data: {
        organizationId,
        uploadedByUserId,
        storageProvider: "S3_COMPAT",
        bucket: this.fileStorage.bucketName,
        objectKey,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.checksumSha256,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }

  private async ensureAttachmentTarget(
    organizationId: string,
    relatedType: string | null,
    relatedId: string | null,
    action: "read" | "write" | "delete"
  ) {
    if (!relatedType && !relatedId) {
      return;
    }

    if (!relatedType || !relatedId) {
      throw new BadRequestException("Attachment links require both relatedType and relatedId.");
    }

    if (relatedType === "contact") {
      const contact = await this.prisma.contact.findFirst({
        where: { id: relatedId, organizationId }
      });

      if (!contact) {
        throw new NotFoundException("Contact not found.");
      }
      return;
    }

    if (relatedType === "connector-account") {
      const connectorAccount = await this.prisma.connectorAccount.findFirst({
        where: { id: relatedId, organizationId }
      });

      if (!connectorAccount) {
        throw new NotFoundException("Connector account not found.");
      }
      return;
    }

    if (relatedType === "sales-invoice") {
      const invoice = await this.prisma.salesInvoice.findFirst({
        where: { id: relatedId, organizationId },
        include: {
          complianceDocument: {
            select: { id: true }
          }
        }
      });

      if (!invoice) {
        throw new NotFoundException("Invoice not found.");
      }

      if (action !== "read" && (invoice.status !== "DRAFT" || invoice.complianceDocument)) {
        throw new BadRequestException(
          "Attachments can only be changed while an invoice remains in draft."
        );
      }
      return;
    }

    if (relatedType === "purchase-bill") {
      const bill = await this.prisma.purchaseBill.findFirst({
        where: { id: relatedId, organizationId }
      });

      if (!bill) {
        throw new NotFoundException("Bill not found.");
      }

      if (action !== "read" && bill.status !== "DRAFT") {
        throw new BadRequestException(
          "Attachments can only be changed while a bill remains in draft."
        );
      }
      return;
    }

    if (relatedType === "quote") {
      const quote = await this.prisma.quote.findFirst({
        where: { id: relatedId, organizationId }
      });

      if (!quote) {
        throw new NotFoundException("Quote not found.");
      }

      if (action !== "read" && quote.status === "CONVERTED") {
        throw new BadRequestException(
          "Attachments can no longer be changed after a quote is converted."
        );
      }
      return;
    }

    throw new BadRequestException("Unsupported attachment target.");
  }
}
