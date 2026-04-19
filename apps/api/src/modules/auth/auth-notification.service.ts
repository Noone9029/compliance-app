import { Inject, Injectable } from "@nestjs/common";

import { loadEnv } from "@daftar/config";
import { PrismaService } from "../../common/prisma/prisma.service";

export type AuthNotificationKind = "INVITATION" | "PASSWORD_RESET";

export type AuthNotificationDelivery = {
  kind: AuthNotificationKind;
  email: string;
  subject: string;
  body: string;
  actionUrl: string;
  templateKey: string;
  organizationId: string | null;
  createdAt: string;
};

function replaceTemplateTokens(
  template: string,
  values: Record<string, string>
) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template
  );
}

@Injectable()
export class AuthNotificationService {
  private readonly env = loadEnv();
  private readonly prisma: PrismaService;
  private readonly deliveries: AuthNotificationDelivery[] = [];

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async sendInvitation(input: {
    organizationId: string;
    organizationName: string;
    email: string;
    fullName: string;
    roleKey: string;
    rawToken: string;
  }) {
    const actionUrl = `${this.env.APP_BASE_URL}/invite/accept?token=${input.rawToken}`;
    const template = await this.resolveTemplate(input.organizationId, "team-invitation", {
      subject: `${input.organizationName}: you're invited to Daftar`,
      body: [
        "Hello {{fullName}},",
        "",
        "You've been invited to {{organizationName}} as {{roleKey}}.",
        "Open this secure link to accept the invitation:",
        "{{actionUrl}}"
      ].join("\n")
    });

    this.recordDelivery({
      kind: "INVITATION",
      email: input.email,
      actionUrl,
      organizationId: input.organizationId,
      subject: replaceTemplateTokens(template.subject, {
        organizationName: input.organizationName,
        fullName: input.fullName,
        roleKey: input.roleKey.replaceAll("_", " "),
        actionUrl
      }),
      body: replaceTemplateTokens(template.body, {
        organizationName: input.organizationName,
        fullName: input.fullName,
        roleKey: input.roleKey.replaceAll("_", " "),
        actionUrl
      }),
      templateKey: template.key
    });
  }

  async sendPasswordReset(input: {
    email: string;
    fullName: string;
    rawToken: string;
  }) {
    const actionUrl = `${this.env.APP_BASE_URL}/password/reset?token=${input.rawToken}`;
    const template = await this.resolveTemplate(null, "password-reset", {
      subject: "Daftar: reset your password",
      body: [
        "Hello {{fullName}},",
        "",
        "We received a request to reset your password.",
        "Open this secure link to continue:",
        "{{actionUrl}}"
      ].join("\n")
    });

    this.recordDelivery({
      kind: "PASSWORD_RESET",
      email: input.email,
      actionUrl,
      organizationId: null,
      subject: replaceTemplateTokens(template.subject, {
        fullName: input.fullName,
        actionUrl
      }),
      body: replaceTemplateTokens(template.body, {
        fullName: input.fullName,
        actionUrl
      }),
      templateKey: template.key
    });
  }

  listDeliveries() {
    return [...this.deliveries];
  }

  clearDeliveries() {
    this.deliveries.length = 0;
  }

  private recordDelivery(delivery: Omit<AuthNotificationDelivery, "createdAt">) {
    this.deliveries.push({
      ...delivery,
      createdAt: new Date().toISOString()
    });
  }

  private async resolveTemplate(
    organizationId: string | null,
    key: string,
    fallback: { subject: string; body: string }
  ) {
    if (!organizationId) {
      return {
        key,
        ...fallback
      };
    }

    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        organizationId,
        key,
        isActive: true
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    if (!template) {
      return {
        key,
        ...fallback
      };
    }

    return {
      key: template.key,
      subject: template.subject,
      body: template.body
    };
  }
}
