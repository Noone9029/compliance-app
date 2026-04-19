import type { StoredFileRecord } from "@daftar/types";

export function mapStoredFileRecord(file: {
  id: string;
  organizationId: string;
  storageProvider: "S3_COMPAT";
  bucket: string;
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  relatedType: string | null;
  relatedId: string | null;
  metadata: unknown;
  createdAt: Date;
}) : StoredFileRecord {
  return {
    id: file.id,
    organizationId: file.organizationId,
    storageProvider: file.storageProvider,
    bucket: file.bucket,
    objectKey: file.objectKey,
    originalFileName: file.originalFileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    checksumSha256: file.checksumSha256,
    relatedType: file.relatedType,
    relatedId: file.relatedId,
    metadata: (file.metadata as Record<string, unknown> | null) ?? null,
    createdAt: file.createdAt.toISOString()
  };
}
