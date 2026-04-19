import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";

import { RequestContextMiddleware } from "./common/middleware/request-context.middleware";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { AccountingShellModule } from "./modules/accounting-shell/accounting-shell.module";
import { BillingModule } from "./modules/billing/billing.module";
import { ChartsModule } from "./modules/charts/charts.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { ConnectorsModule } from "./modules/connectors/connectors.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { FilesModule } from "./modules/files/files.module";
import { HealthModule } from "./modules/health/health.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { JournalsModule } from "./modules/journals/journals.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PurchasesModule } from "./modules/purchases/purchases.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SalesModule } from "./modules/sales/sales.module";
import { PurchaseExtensionsModule } from "./modules/purchase-extensions/purchase-extensions.module";
import { SalesExtensionsModule } from "./modules/sales-extensions/sales-extensions.module";
import { SetupModule } from "./modules/setup/setup.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    BillingModule,
    AssetsModule,
    AccountingShellModule,
    UsersModule,
    OrganizationsModule,
    MembershipsModule,
    RbacModule,
    HealthModule,
    SetupModule,
    ContactsModule,
    ConnectorsModule,
    FilesModule,
    InventoryModule,
    JournalsModule,
    SalesModule,
    SalesExtensionsModule,
    PurchasesModule,
    PurchaseExtensionsModule,
    QuotesModule,
    ComplianceModule,
    ReportsModule,
    ChartsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
