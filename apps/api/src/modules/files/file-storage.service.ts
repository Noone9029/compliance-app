import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  StorageObjectNotFoundError,
  StorageService,
} from "../storage/storage.service";

@Injectable()
export class FileStorageService {
  constructor(
    @Inject(StorageService)
    private readonly storage: StorageService,
  ) {}

  get bucketName() {
    return this.storage.bucketName;
  }

  async putObject(objectKey: string, buffer: Buffer) {
    await this.storage.putObject({
      objectKey,
      body: buffer,
    });
  }

  async getObject(objectKey: string) {
    try {
      return await this.storage.getObject(objectKey);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        throw new NotFoundException("Stored file content is no longer available.");
      }

      throw error;
    }
  }

  async deleteObject(objectKey: string) {
    await this.storage.deleteObject({
      objectKey,
      allowDelete: true,
    });
  }
}
