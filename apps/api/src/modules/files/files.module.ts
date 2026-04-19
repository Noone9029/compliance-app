import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { FileStorageService } from "./file-storage.service";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [AuditModule],
  controllers: [FilesController],
  providers: [FilesService, FileStorageService],
  exports: [FilesService]
})
export class FilesModule {}
