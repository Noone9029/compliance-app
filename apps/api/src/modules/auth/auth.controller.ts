import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { loadEnv } from "@daftar/config";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuthService } from "./auth.service";

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

const invitationSchema = z.object({
  token: z.string().min(1)
});

const invitationAcceptSchema = invitationSchema.extend({
  fullName: z.string().min(1).optional().nullable(),
  password: z.string().min(8)
});

const passwordResetRequestSchema = z.object({
  email: z.email()
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

const env = loadEnv();

function resolveSessionCookieOptions() {
  const secure =
    env.SESSION_COOKIE_SECURE === "auto"
      ? env.NODE_ENV === "production" || env.SESSION_COOKIE_SAME_SITE === "none"
      : env.SESSION_COOKIE_SECURE === "true";

  return {
    httpOnly: true,
    sameSite: env.SESSION_COOKIE_SAME_SITE,
    secure,
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000
  } as const;
}

@Controller("v1/auth")
export class AuthController {
  private readonly authService: AuthService;

  constructor(@Inject(AuthService) authService: AuthService) {
    this.authService = authService;
  }

  @Post("sign-in")
  async signIn(
    @Body() body: unknown,
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const parsed = signInSchema.parse(body);
    const result = await this.authService.signIn({
      email: parsed.email,
      password: parsed.password,
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });

    response.cookie(env.SESSION_COOKIE_NAME, result.token, {
      ...resolveSessionCookieOptions()
    });

    return result.session;
  }

  @Post("sign-out")
  async signOut(
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const rawToken = request.cookies?.[env.SESSION_COOKIE_NAME];
    await this.authService.signOut({
      rawToken,
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });
    response.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      sameSite: env.SESSION_COOKIE_SAME_SITE,
      secure:
        env.SESSION_COOKIE_SECURE === "auto"
          ? env.NODE_ENV === "production" || env.SESSION_COOKIE_SAME_SITE === "none"
          : env.SESSION_COOKIE_SECURE === "true"
    });
    return { ok: true };
  }

  @Get("session")
  async session(@Req() request: Request & AuthenticatedRequest) {
    return this.authService.sessionSnapshot(request.cookies?.[env.SESSION_COOKIE_NAME]);
  }

  @Post("refresh")
  @UseGuards(AuthenticatedGuard)
  async refresh(@Req() request: Request & AuthenticatedRequest) {
    return this.authService.refresh(request.cookies?.[env.SESSION_COOKIE_NAME]);
  }

  @Get("invitations/:token")
  invitationPreview(@Param("token") token: string) {
    return this.authService.getInvitationPreview(token);
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: unknown,
    @Req() request: Request & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const parsed = invitationAcceptSchema.parse(body);
    const result = await this.authService.acceptInvitation({
      token: parsed.token,
      fullName: parsed.fullName,
      password: parsed.password,
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });

    response.cookie(env.SESSION_COOKIE_NAME, result.token, {
      ...resolveSessionCookieOptions()
    });

    return {
      accepted: true,
      session: result.session
    };
  }

  @Post("password-reset/request")
  requestPasswordReset(
    @Body() body: unknown,
    @Req() request: Request & AuthenticatedRequest
  ) {
    const parsed = passwordResetRequestSchema.parse(body);
    return this.authService.requestPasswordReset({
      email: parsed.email,
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });
  }

  @Post("password-reset/confirm")
  confirmPasswordReset(
    @Body() body: unknown,
    @Req() request: Request & AuthenticatedRequest
  ) {
    const parsed = passwordResetConfirmSchema.parse(body);
    return this.authService.resetPassword({
      token: parsed.token,
      password: parsed.password,
      requestId: request.requestId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });
  }
}
