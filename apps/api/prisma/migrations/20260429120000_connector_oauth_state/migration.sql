-- CreateTable
CREATE TABLE "ConnectorOAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorOAuthState_nonceHash_key" ON "ConnectorOAuthState"("nonceHash");

-- CreateIndex
CREATE INDEX "ConnectorOAuthState_organizationId_userId_provider_expiresAt_idx" ON "ConnectorOAuthState"("organizationId", "userId", "provider", "expiresAt");

-- CreateIndex
CREATE INDEX "ConnectorOAuthState_expiresAt_idx" ON "ConnectorOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "ConnectorOAuthState" ADD CONSTRAINT "ConnectorOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorOAuthState" ADD CONSTRAINT "ConnectorOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
