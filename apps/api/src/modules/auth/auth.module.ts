import { Global, Module } from "@nestjs/common";

import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { AuditModule } from "../audit/audit.module";
import { RbacModule } from "../rbac/rbac.module";
import { AuthNotificationService } from "./auth-notification.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Global()
@Module({
  imports: [RbacModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, AuthNotificationService, AuthenticatedGuard],
  exports: [AuthService, AuthNotificationService, AuthenticatedGuard]
})
export class AuthModule {}
