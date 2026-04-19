import { promises as fs } from "node:fs";
import path from "node:path";

import { Injectable, NotFoundException } from "@nestjs/common";

import { loadEnv } from "@daftar/config";

@Injectable()
export class FileStorageService {
  private readonly env = loadEnv();
  private readonly storageRoot = path.resolve(process.cwd(), ".local-storage", "files");

  get bucketName() {
    return this.env.S3_BUCKET || "daftar-local";
  }

  async putObject(objectKey: string, buffer: Buffer) {
    const filePath = this.resolveStoragePath(objectKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async getObject(objectKey: string) {
    try {
      return await fs.readFile(this.resolveStoragePath(objectKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("Stored file content is no longer available.");
      }

      throw error;
    }
  }

  async deleteObject(objectKey: string) {
    const filePath = this.resolveStoragePath(objectKey);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await this.pruneEmptyDirectories(path.dirname(filePath));
  }

  private resolveStoragePath(objectKey: string) {
    return path.resolve(this.storageRoot, objectKey);
  }

  private async pruneEmptyDirectories(startPath: string) {
    let currentPath = startPath;

    while (currentPath.startsWith(this.storageRoot) && currentPath !== this.storageRoot) {
      const entries = await fs.readdir(currentPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }

        throw error;
      });

      if (!entries || entries.length > 0) {
        return;
      }

      await fs.rmdir(currentPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
      currentPath = path.dirname(currentPath);
    }
  }
}
