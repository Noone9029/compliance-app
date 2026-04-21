import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { ConnectorSecretsBackfillService } from "./connector-secrets-backfill.service";

function createHarness() {
  const findMany = vi.fn();
  const update = vi.fn();
  const upsertFromEncryptedSnapshot = vi.fn();
  const encryptRawSecret = vi.fn((value: string) => `enc(${value})`);

  const prisma = {
    connectorAccount: {
      findMany,
      update
    }
  } as any;

  const connectorCredentials = {
    upsertFromEncryptedSnapshot,
    encryptRawSecret
  } as any;

  const service = new ConnectorSecretsBackfillService(
    prisma,
    connectorCredentials
  );

  return {
    service,
    mocks: {
      findMany,
      update,
      upsertFromEncryptedSnapshot,
      encryptRawSecret
    }
  };
}

describe("connector secrets backfill service", () => {
  it("migrates plaintext metadata tokens into connector credentials and scrubs metadata", async () => {
    const { service, mocks } = createHarness();

    mocks.findMany.mockResolvedValue([
      {
        id: "conn_legacy",
        provider: "QUICKBOOKS_ONLINE",
        scopes: ["customers.read"],
        credential: null,
        metadata: {
          accessToken: "legacy-access",
          refreshToken: "legacy-refresh",
          expiresAt: "2099-01-01T00:00:00.000Z",
          raw: { token_type: "bearer" },
          keepThis: "note"
        }
      }
    ]);

    const result = await service.backfillLegacyQuickBooksConnectorSecrets();

    expect(result).toEqual({
      scanned: 1,
      credentialsUpserted: 1,
      metadataScrubbed: 1
    });

    expect(mocks.encryptRawSecret).toHaveBeenCalledWith("legacy-access");
    expect(mocks.encryptRawSecret).toHaveBeenCalledWith("legacy-refresh");
    expect(mocks.upsertFromEncryptedSnapshot).toHaveBeenCalledWith({
      connectorAccountId: "conn_legacy",
      provider: "QUICKBOOKS_ONLINE",
      accessTokenEncrypted: "enc(legacy-access)",
      refreshTokenEncrypted: "enc(legacy-refresh)",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      tokenType: "bearer",
      scopes: ["customers.read"],
      credentialMetadata: null
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conn_legacy" },
      data: {
        metadata: {
          keepThis: "note"
        }
      }
    });
  });

  it("scrubs metadata token fields when credential already exists", async () => {
    const { service, mocks } = createHarness();

    mocks.findMany.mockResolvedValue([
      {
        id: "conn_existing",
        provider: "QUICKBOOKS_ONLINE",
        scopes: ["customers.read"],
        credential: { id: "cred_1" },
        metadata: {
          accessTokenEncrypted: "enc(access)",
          refreshTokenEncrypted: "enc(refresh)",
          expiresAt: "2099-01-01T00:00:00.000Z",
          raw: { token_type: "bearer" }
        }
      }
    ]);

    const result = await service.backfillLegacyQuickBooksConnectorSecrets();

    expect(result).toEqual({
      scanned: 1,
      credentialsUpserted: 0,
      metadataScrubbed: 1
    });
    expect(mocks.upsertFromEncryptedSnapshot).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conn_existing" },
      data: {
        metadata: Prisma.JsonNull
      }
    });
  });

  it("skips accounts without migratable token metadata", async () => {
    const { service, mocks } = createHarness();

    mocks.findMany.mockResolvedValue([
      {
        id: "conn_no_tokens",
        provider: "QUICKBOOKS_ONLINE",
        scopes: ["customers.read"],
        credential: null,
        metadata: {
          lastError: "Token refresh required"
        }
      }
    ]);

    const result = await service.backfillLegacyQuickBooksConnectorSecrets();

    expect(result).toEqual({
      scanned: 1,
      credentialsUpserted: 0,
      metadataScrubbed: 0
    });
    expect(mocks.upsertFromEncryptedSnapshot).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
