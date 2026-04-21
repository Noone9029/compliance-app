import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";

import { QuickBooksAdapter } from "./quickbooks.adapter";
import { QuickBooksApiClient } from "./quickbooks.api";
import { QuickBooksTransport } from "./quickbooks.transport";
import { ConnectorCredentialsService } from "./connector-credentials.service";
import { ConnectorSecretsBackfillService } from "./connector-secrets-backfill.service";
import { ConnectorSecretsService } from "./connector-secrets.service";
import { XeroAdapter } from "./xero.adapter";
import { XeroApiClient } from "./xero.api";
import { XeroTransport } from "./xero.transport";
import { ZohoBooksAdapter } from "./zoho-books.adapter";
import { ZohoApiClient } from "./zoho.api";
import { ZohoTransport } from "./zoho.transport";
import { ConnectorsController } from "./connectors.controller";
import { ConnectorsService } from "./connectors.service";

@Module({
  imports: [ComplianceModule],
  controllers: [ConnectorsController],
  providers: [
    ConnectorsService,
    XeroAdapter,
    QuickBooksAdapter,
    ZohoBooksAdapter,
    XeroTransport,
    XeroApiClient,
    ZohoTransport,
    ZohoApiClient,
    QuickBooksTransport,
    QuickBooksApiClient,
    ConnectorSecretsService,
    ConnectorCredentialsService,
    ConnectorSecretsBackfillService
  ],
  exports: [ConnectorsService]
})
export class ConnectorsModule {}
