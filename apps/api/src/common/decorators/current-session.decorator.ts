import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "../utils/request-context";

export const CurrentSession = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.currentSession ?? null;
});
