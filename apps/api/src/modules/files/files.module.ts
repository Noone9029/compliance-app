import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { FileStorageService } from "./file-storage.service";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService, FileStorageService],
  exports: [FilesService]
})
export class FilesModule {}
