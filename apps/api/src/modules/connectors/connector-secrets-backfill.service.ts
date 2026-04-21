import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ConnectorCredentialsService } from "./connector-credentials.service";

type ConnectorMetadataObject = Record<string, unknown>;

@Injectable()
export class ConnectorSecretsBackfillService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConnectorCredentialsService)
    private readonly connectorCredentials: ConnectorCredentialsService
  ) {}

  async onModuleInit() {
    await this.backfillLegacyQuickBooksConnectorSecrets();
  }

  async backfillLegacyQuickBooksConnectorSecrets() {
    const accounts = await this.prisma.connectorAccount.findMany({
      where: {
        provider: "QUICKBOOKS_ONLINE"
      },
      select: {
        id: true,
        provider: true,
        scopes: true,
        metadata: true,
        credential: {
          select: {
            id: true
          }
        }
      }
    });

    let credentialsUpserted = 0;
    let metadataScrubbed = 0;

    for (const account of accounts) {
      const metadata = this.asMetadataObject(account.metadata);
      if (!metadata) {
        continue;
      }

      if (!account.credential) {
        const snapshot = this.extractCredentialSnapshotFromMetadata(metadata);

        if (snapshot) {
          await this.connectorCredentials.upsertFromEncryptedSnapshot({
            connectorAccountId: account.id,
            provider: account.provider,
            accessTokenEncrypted: snapshot.accessTokenEncrypted,
            refreshTokenEncrypted: snapshot.refreshTokenEncrypted,
            expiresAt: snapshot.expiresAt,
            tokenType: snapshot.tokenType,
            scopes: this.normalizeScopes(account.scopes),
            credentialMetadata: null
          });

          credentialsUpserted += 1;
        }
      }

      const scrubbed = this.scrubTokenFields(metadata);
      if (scrubbed.changed) {
        await this.prisma.connectorAccount.update({
          where: { id: account.id },
          data: {
            metadata: scrubbed.metadata
              ? (scrubbed.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull
          }
        });
        metadataScrubbed += 1;
      }
    }

    return {
      scanned: accounts.length,
      credentialsUpserted,
      metadataScrubbed
    };
  }

  private extractCredentialSnapshotFromMetadata(metadata: ConnectorMetadataObject) {
    const expiresAtValue = metadata.expiresAt;
    const expiresAt = this.parseDate(expiresAtValue);
    if (!expiresAt) {
      return null;
    }

    const encryptedAccessToken = this.stringValue(metadata.accessTokenEncrypted);
    const encryptedRefreshToken = this.stringValue(metadata.refreshTokenEncrypted);

    if (encryptedAccessToken && encryptedRefreshToken) {
      return {
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        expiresAt,
        tokenType: this.extractTokenType(metadata.raw)
      };
    }

    const plainAccessToken = this.stringValue(metadata.accessToken);
    const plainRefreshToken = this.stringValue(metadata.refreshToken);

    if (!plainAccessToken || !plainRefreshToken) {
      return null;
    }

    return {
      accessTokenEncrypted: this.connectorCredentials.encryptRawSecret(
        plainAccessToken
      ),
      refreshTokenEncrypted: this.connectorCredentials.encryptRawSecret(
        plainRefreshToken
      ),
      expiresAt,
      tokenType: this.extractTokenType(metadata.raw)
    };
  }

  private scrubTokenFields(metadata: ConnectorMetadataObject): {
    changed: boolean;
    metadata: ConnectorMetadataObject | null;
  } {
    const keysToRemove = [
      "credentialVersion",
      "accessToken",
      "refreshToken",
      "accessTokenEncrypted",
      "refreshTokenEncrypted",
      "expiresAt",
      "raw"
    ];

    let changed = false;
    const next: ConnectorMetadataObject = { ...metadata };

    for (const key of keysToRemove) {
      if (key in next) {
        delete next[key];
        changed = true;
      }
    }

    if (!changed) {
      return {
        changed: false,
        metadata
      };
    }

    if (Object.keys(next).length === 0) {
      return {
        changed: true,
        metadata: null
      };
    }

    return {
      changed: true,
      metadata: next
    };
  }

  private normalizeScopes(scopes: Prisma.JsonValue | null) {
    if (!Array.isArray(scopes)) {
      return [] as string[];
    }

    return scopes.filter((scope): scope is string => typeof scope === "string");
  }

  private asMetadataObject(
    metadata: Prisma.JsonValue | null
  ): ConnectorMetadataObject | null {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
      return null;
    }

    return metadata as ConnectorMetadataObject;
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private parseDate(value: unknown) {
    if (typeof value !== "string" && !(value instanceof Date)) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private extractTokenType(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }

    const tokenType = (raw as Record<string, unknown>).token_type;
    return typeof tokenType === "string" && tokenType.trim()
      ? tokenType.trim()
      : null;
  }
}
