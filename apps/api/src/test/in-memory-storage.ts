import type { INestApplication } from "@nestjs/common";

import { StorageObjectNotFoundError, StorageService } from "../modules/storage/storage.service";

type StoredObject = {
  body: Buffer;
  contentType?: string;
};

export function installInMemoryStorage(app: INestApplication) {
  const storage = app.get(StorageService);
  const objects = new Map<string, StoredObject>();

  storage.putObject = async (input) => {
    objects.set(input.objectKey, {
      body: Buffer.from(input.body),
      contentType: input.contentType,
    });
  };

  storage.getObject = async (objectKey) => {
    const object = objects.get(objectKey);
    if (!object) {
      throw new StorageObjectNotFoundError();
    }

    return Buffer.from(object.body);
  };

  storage.deleteObject = async (input) => {
    if (input.allowDelete !== true) {
      throw new Error("deleteObject requires explicit allowDelete: true.");
    }

    objects.delete(input.objectKey);
  };

  storage.createSignedUploadUrl = (input) => {
    const expiresInSeconds = input.expiresInSeconds ?? 15 * 60;
    return {
      method: "PUT",
      url: `memory://storage/${encodeURIComponent(input.objectKey)}?expires=${expiresInSeconds}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      expiresInSeconds,
    };
  };

  storage.createSignedDownloadUrl = (input) => {
    const expiresInSeconds = input.expiresInSeconds ?? 15 * 60;
    return {
      method: "GET",
      url: `memory://storage/${encodeURIComponent(input.objectKey)}?expires=${expiresInSeconds}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      expiresInSeconds,
    };
  };

  storage.checkReadiness = async () => ({
    status: "ok",
    bucket: storage.bucketName,
    endpoint: "memory://storage",
    provider: "s3-compatible",
  });

  return {
    objects,
  };
}
