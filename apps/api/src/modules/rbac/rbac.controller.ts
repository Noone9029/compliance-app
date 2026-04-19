import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import type { AuthenticatedRequest } from "../../common/utils/request-context";

@Controller("v1/rbac")
export class RbacController {
  @Get("capabilities")
  @UseGuards(AuthenticatedGuard)
  capabilities(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    return session?.capabilitySnapshot ?? { roleKey: null, permissions: [] };
  }
}
