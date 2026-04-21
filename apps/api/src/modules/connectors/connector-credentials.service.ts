import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConnectorProvider } from "@daftar/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ConnectorSecretsService } from "./connector-secrets.service";
import type { ConnectorTokenSet } from "./provider-transport";

type PrismaTx = Prisma.TransactionClient;

export type ConnectorCredentialMetadata = {
  apiDomain?: string;
};

export type DecryptedConnectorCredential = {
  connectorAccountId: string;
  provider: ConnectorProvider;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string | null;
  scopes: string[];
  credentialMetadata: ConnectorCredentialMetadata | null;
  rotationCount: number;
  lastRotatedAt: Date | null;
};

@Injectable()
export class ConnectorCredentialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConnectorSecretsService)
    private readonly connectorSecrets: ConnectorSecretsService
  ) {}

  async saveConnectedCredentials(
    input: {
      connectorAccountId: string;
      provider: ConnectorProvider;
      tokenSet: ConnectorTokenSet;
    },
    tx?: PrismaTx
  ) {
    const repo = this.repo(tx);
    const payload = this.buildEncryptedPayload(input.tokenSet);
    const credentialMetadata = this.resolveCredentialMetadata({
      provider: input.provider,
      raw: input.tokenSet.raw
    });

    await repo.upsert({
      where: { connectorAccountId: input.connectorAccountId },
      update: {
        provider: input.provider,
        accessTokenEncrypted: payload.accessTokenEncrypted,
        refreshTokenEncrypted: payload.refreshTokenEncrypted,
        expiresAt: payload.expiresAt,
        tokenType: payload.tokenType,
        scopeSnapshot: input.tokenSet.scopes as Prisma.InputJsonValue,
        credentialMetadata: credentialMetadata ?? Prisma.JsonNull,
        rotationCount: 0,
        lastRotatedAt: null
      },
      create: {
        connectorAccountId: input.connectorAccountId,
        provider: input.provider,
        accessTokenEncrypted: payload.accessTokenEncrypted,
        refreshTokenEncrypted: payload.refreshTokenEncrypted,
        expiresAt: payload.expiresAt,
        tokenType: payload.tokenType,
        scopeSnapshot: input.tokenSet.scopes as Prisma.InputJsonValue,
        credentialMetadata: credentialMetadata ?? Prisma.JsonNull,
        rotationCount: 0,
        lastRotatedAt: null
      }
    });
  }

  async rotateCredentials(
    input: {
      connectorAccountId: string;
      provider: ConnectorProvider;
      tokenSet: ConnectorTokenSet;
    },
    tx?: PrismaTx
  ) {
    const repo = this.repo(tx);
    const payload = this.buildEncryptedPayload(input.tokenSet);
    const now = new Date();
    const existingCredential = await repo.findUnique({
      where: { connectorAccountId: input.connectorAccountId },
      select: { credentialMetadata: true }
    });
    const credentialMetadata = this.resolveCredentialMetadata({
      provider: input.provider,
      raw: input.tokenSet.raw,
      existing: existingCredential?.credentialMetadata ?? null
    });

    await repo.upsert({
      where: { connectorAccountId: input.connectorAccountId },
      update: {
        provider: input.provider,
        accessTokenEncrypted: payload.accessTokenEncrypted,
        refreshTokenEncrypted: payload.refreshTokenEncrypted,
        expiresAt: payload.expiresAt,
        tokenType: payload.tokenType,
        scopeSnapshot: input.tokenSet.scopes as Prisma.InputJsonValue,
        credentialMetadata: credentialMetadata ?? Prisma.JsonNull,
        rotationCount: {
          increment: 1
        },
        lastRotatedAt: now
      },
      create: {
        connectorAccountId: input.connectorAccountId,
        provider: input.provider,
        accessTokenEncrypted: payload.accessTokenEncrypted,
        refreshTokenEncrypted: payload.refreshTokenEncrypted,
        expiresAt: payload.expiresAt,
        tokenType: payload.tokenType,
        scopeSnapshot: input.tokenSet.scopes as Prisma.InputJsonValue,
        credentialMetadata: credentialMetadata ?? Prisma.JsonNull,
        rotationCount: 1,
        lastRotatedAt: now
      }
    });
  }

  async upsertFromEncryptedSnapshot(
    input: {
      connectorAccountId: string;
      provider: ConnectorProvider;
      accessTokenEncrypted: string;
      refreshTokenEncrypted: string;
      expiresAt: Date | string;
      tokenType?: string | null;
      scopes?: string[];
      credentialMetadata?: Prisma.InputJsonValue | null;
    },
    tx?: PrismaTx
  ) {
    const repo = this.repo(tx);
    const expiresAt = this.parseExpiryDate(input.expiresAt);

    await repo.upsert({
      where: { connectorAccountId: input.connectorAccountId },
      update: {
        provider: input.provider,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        expiresAt,
        tokenType: input.tokenType ?? null,
        scopeSnapshot: (input.scopes ?? []) as Prisma.InputJsonValue,
        credentialMetadata: input.credentialMetadata ?? Prisma.JsonNull
      },
      create: {
        connectorAccountId: input.connectorAccountId,
        provider: input.provider,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        expiresAt,
        tokenType: input.tokenType ?? null,
        scopeSnapshot: (input.scopes ?? []) as Prisma.InputJsonValue,
        credentialMetadata: input.credentialMetadata ?? Prisma.JsonNull,
        rotationCount: 0
      }
    });
  }

  async getDecryptedCredentials(
    connectorAccountId: string,
    tx?: PrismaTx
  ): Promise<DecryptedConnectorCredential> {
    const repo = this.repo(tx);
    const credential = await repo.findUnique({
      where: {
        connectorAccountId
      }
    });

    if (!credential) {
      throw new Error("Connector credentials are missing for this account.");
    }

    if (
      !credential.accessTokenEncrypted?.trim() ||
      !credential.refreshTokenEncrypted?.trim()
    ) {
      throw new Error("Connector credentials are incomplete for this account.");
    }

    return {
      connectorAccountId: credential.connectorAccountId,
      provider: credential.provider as ConnectorProvider,
      accessToken: this.connectorSecrets.decrypt(credential.accessTokenEncrypted),
      refreshToken: this.connectorSecrets.decrypt(credential.refreshTokenEncrypted),
      expiresAt: credential.expiresAt,
      tokenType: credential.tokenType,
      scopes: this.normalizeScopes(credential.scopeSnapshot),
      credentialMetadata: this.parseCredentialMetadata(
        credential.credentialMetadata
      ),
      rotationCount: credential.rotationCount,
      lastRotatedAt: credential.lastRotatedAt
    };
  }

  encryptRawSecret(secret: string) {
    return this.connectorSecrets.encrypt(secret);
  }

  private repo(tx?: PrismaTx) {
    return tx?.connectorCredential ?? this.prisma.connectorCredential;
  }

  private buildEncryptedPayload(tokenSet: ConnectorTokenSet) {
    return {
      accessTokenEncrypted: this.connectorSecrets.encrypt(tokenSet.accessToken),
      refreshTokenEncrypted: this.connectorSecrets.encrypt(tokenSet.refreshToken),
      expiresAt: this.parseExpiryDate(tokenSet.expiresAt),
      tokenType: this.extractTokenType(tokenSet.raw)
    };
  }

  private extractTokenType(raw: Record<string, unknown>) {
    const tokenType = raw.token_type;
    return typeof tokenType === "string" && tokenType.trim()
      ? tokenType.trim()
      : null;
  }

  private normalizeScopes(scopes: Prisma.JsonValue | null) {
    if (!Array.isArray(scopes)) {
      return [] as string[];
    }

    return scopes.filter((scope): scope is string => typeof scope === "string");
  }

  private resolveCredentialMetadata(input: {
    provider: ConnectorProvider;
    raw: Record<string, unknown>;
    existing?: Prisma.JsonValue | null;
  }) {
    if (input.provider !== "ZOHO_BOOKS") {
      return null;
    }

    const apiDomain =
      this.extractZohoApiDomain(input.raw) ??
      this.parseCredentialMetadata(input.existing ?? null)?.apiDomain ??
      null;

    if (!apiDomain) {
      return null;
    }

    return {
      apiDomain
    } as Prisma.InputJsonValue;
  }

  private parseCredentialMetadata(
    value: Prisma.JsonValue | null
  ): ConnectorCredentialMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const apiDomain = (value as Record<string, unknown>).apiDomain;

    if (typeof apiDomain === "string" && apiDomain.trim()) {
      return {
        apiDomain: apiDomain.trim()
      };
    }

    return null;
  }

  private extractZohoApiDomain(raw: Record<string, unknown>) {
    const apiDomain = raw.api_domain;

    if (typeof apiDomain === "string" && apiDomain.trim()) {
      return apiDomain.trim();
    }

    return null;
  }

  private parseExpiryDate(value: Date | string) {
    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Connector credential expiry timestamp is invalid.");
    }

    return parsed;
  }
}
