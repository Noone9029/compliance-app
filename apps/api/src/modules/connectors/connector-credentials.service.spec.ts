import { describe, expect, it, vi } from "vitest";

import { ConnectorCredentialsService } from "./connector-credentials.service";

function createHarness() {
  const upsert = vi.fn();
  const findUnique = vi.fn();

  const prisma = {
    connectorCredential: {
      upsert,
      findUnique
    }
  } as any;

  const connectorSecrets = {
    encrypt: vi.fn((value: string) => `enc(${value})`),
    decrypt: vi.fn((value: string) => value.replace(/^enc\((.*)\)$/, "$1"))
  } as any;

  const service = new ConnectorCredentialsService(prisma, connectorSecrets);

  return {
    service,
    mocks: {
      upsert,
      findUnique,
      connectorSecrets
    }
  };
}

describe("connector credentials service", () => {
  it("stores connected credential tokens in encrypted form", async () => {
    const { service, mocks } = createHarness();

    await service.saveConnectedCredentials({
      connectorAccountId: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      tokenSet: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["customers.read"],
        externalTenantId: "realm-123",
        displayName: "QuickBooks",
        raw: { token_type: "bearer" }
      }
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.upsert.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ connectorAccountId: "conn_1" });
    expect(arg.update.accessTokenEncrypted).toBe("enc(access-token)");
    expect(arg.update.refreshTokenEncrypted).toBe("enc(refresh-token)");
    expect(arg.update.rotationCount).toBe(0);
    expect(arg.update.lastRotatedAt).toBeNull();
  });

  it("persists Zoho api_domain in credential metadata", async () => {
    const { service, mocks } = createHarness();

    await service.saveConnectedCredentials({
      connectorAccountId: "conn_zoho_1",
      provider: "ZOHO_BOOKS",
      tokenSet: {
        accessToken: "zoho-access",
        refreshToken: "zoho-refresh",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["ZohoBooks.fullaccess.all"],
        externalTenantId: "zoho-org-123",
        displayName: "Zoho Books",
        raw: {
          token_type: "Bearer",
          api_domain: "https://www.zohoapis.eu"
        }
      }
    });

    const arg = mocks.upsert.mock.calls[0]?.[0];
    expect(arg.update.credentialMetadata).toEqual({
      apiDomain: "https://www.zohoapis.eu"
    });
    expect(arg.create.credentialMetadata).toEqual({
      apiDomain: "https://www.zohoapis.eu"
    });
  });

  it("reads and decrypts stored credentials", async () => {
    const { service, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      connectorAccountId: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      accessTokenEncrypted: "enc(access-token)",
      refreshTokenEncrypted: "enc(refresh-token)",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      tokenType: "bearer",
      scopeSnapshot: ["customers.read", "invoices.read"],
      credentialMetadata: {
        apiDomain: "https://www.zohoapis.eu"
      },
      rotationCount: 2,
      lastRotatedAt: new Date("2026-04-21T00:00:00.000Z")
    });

    const credentials = await service.getDecryptedCredentials("conn_1");

    expect(credentials.accessToken).toBe("access-token");
    expect(credentials.refreshToken).toBe("refresh-token");
    expect(credentials.provider).toBe("QUICKBOOKS_ONLINE");
    expect(credentials.scopes).toEqual(["customers.read", "invoices.read"]);
    expect(credentials.credentialMetadata).toEqual({
      apiDomain: "https://www.zohoapis.eu"
    });
    expect(credentials.rotationCount).toBe(2);
  });

  it("keeps existing Zoho apiDomain metadata when refresh response omits api_domain", async () => {
    const { service, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      credentialMetadata: {
        apiDomain: "https://www.zohoapis.eu"
      }
    });

    await service.rotateCredentials({
      connectorAccountId: "conn_zoho_2",
      provider: "ZOHO_BOOKS",
      tokenSet: {
        accessToken: "zoho-new-access",
        refreshToken: "zoho-new-refresh",
        expiresAt: "2099-01-01T00:00:00.000Z",
        scopes: ["ZohoBooks.fullaccess.all"],
        externalTenantId: null,
        displayName: "Zoho Books",
        raw: {
          token_type: "Bearer"
        }
      }
    });

    const arg = mocks.upsert.mock.calls[0]?.[0];
    expect(arg.update.credentialMetadata).toEqual({
      apiDomain: "https://www.zohoapis.eu"
    });
    expect(arg.update.rotationCount).toEqual({
      increment: 1
    });
  });

  it("rejects missing credential rows", async () => {
    const { service, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue(null);

    await expect(service.getDecryptedCredentials("conn_missing")).rejects.toThrow(
      /missing/i
    );
  });
});
