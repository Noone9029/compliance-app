import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import type { AuthenticatedRequest } from "../../common/utils/request-context";

@Controller("v1")
export class UsersController {
  @Get("me")
  @UseGuards(AuthenticatedGuard)
  me(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    return session?.user ?? null;
  }
}
