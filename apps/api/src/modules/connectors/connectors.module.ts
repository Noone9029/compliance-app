import { Module } from "@nestjs/common";

import { QuickBooksAdapter } from "./quickbooks.adapter";
import { QuickBooksApiClient } from "./quickbooks.api";
import { QuickBooksTransport } from "./quickbooks.transport";
import { XeroAdapter } from "./xero.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";
import { ConnectorsController } from "./connectors.controller";
import { ConnectorsService } from "./connectors.service";

@Module({
  controllers: [ConnectorsController],
  providers: [
    ConnectorsService,
    XeroAdapter,
    QuickBooksAdapter,
    ZohoBooksAdapter,
    QuickBooksTransport,
    QuickBooksApiClient
  ],
  exports: [ConnectorsService]
})
export class ConnectorsModule {}