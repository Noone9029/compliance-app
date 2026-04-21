-- CreateTable
CREATE TABLE "ConnectorCredential" (
    "id" TEXT NOT NULL,
    "connectorAccountId" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenType" TEXT,
    "scopeSnapshot" JSONB,
    "credentialMetadata" JSONB,
    "rotationCount" INTEGER NOT NULL DEFAULT 0,
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCredential_connectorAccountId_key" ON "ConnectorCredential"("connectorAccountId");

-- CreateIndex
CREATE INDEX "ConnectorCredential_provider_expiresAt_idx" ON "ConnectorCredential"("provider", "expiresAt");

-- AddForeignKey
ALTER TABLE "ConnectorCredential" ADD CONSTRAINT "ConnectorCredential_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "ConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
