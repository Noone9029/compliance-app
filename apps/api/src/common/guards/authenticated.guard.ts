import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import { AuthService } from "../../modules/auth/auth.service";
import type { AuthenticatedRequest } from "../utils/request-context";

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  private readonly authService: AuthService;

  constructor(@Inject(AuthService) authService: AuthService) {
    this.authService = authService;
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.authService.resolveRequestSession(request);

    if (!session) {
      throw new UnauthorizedException("Authentication required.");
    }

    request.currentSession = session;
    return true;
  }
}
