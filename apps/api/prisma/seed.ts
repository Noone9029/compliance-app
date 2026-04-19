import bcrypt from "bcryptjs";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnv } from "@daftar/config";
import { permissionKeys, roleKeys } from "@daftar/types";

const env = loadEnv();
const storageRoot = path.resolve(process.cwd(), ".local-storage", "files");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

type SeedUser = {
  email: string;
  fullName: string;
  roleKey: RoleKey;
  organizationSlug: string;
};

const seedUsers: SeedUser[] = [
  {
    email: "owner@daftar.local",
    fullName: "Daftar Owner",
    roleKey: "OWNER",
    organizationSlug: "nomad-events",
  },
  {
    email: "admin@daftar.local",
    fullName: "Daftar Admin",
    roleKey: "ADMIN",
    organizationSlug: "nomad-events",
  },
  {
    email: "accountant@daftar.local",
    fullName: "Daftar Accountant",
    roleKey: "ACCOUNTANT",
    organizationSlug: "nomad-events",
  },
  {
    email: "compliance@daftar.local",
    fullName: "Compliance Officer",
    roleKey: "COMPLIANCE_OFFICER",
    organizationSlug: "nomad-events",
  },
  {
    email: "viewer@daftar.local",
    fullName: "Read Only Viewer",
    roleKey: "VIEWER",
    organizationSlug: "nomad-labs",
  },
];

const seededInvitationToken = "invite-nomad-events-accountant";

async function resetSeedStorage() {
  await fs.rm(storageRoot, { recursive: true, force: true });
}

async function writeSeedStoredFiles(
  files: {
    objectKey: string;
    contents: string;
    sizeBytes?: number;
  }[],
) {
  for (const file of files) {
    const filePath = path.resolve(storageRoot, file.objectKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (file.sizeBytes && Buffer.byteLength(file.contents, "utf8") < file.sizeBytes) {
      const buffer = Buffer.alloc(file.sizeBytes, " ");
      buffer.write(file.contents, "utf8");
      await fs.writeFile(filePath, buffer);
      continue;
    }

    await fs.writeFile(filePath, file.contents, "utf8");
  }
}

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

const rolePermissionMap: Record<RoleKey, string[]> = {
  OWNER: [...permissionKeys],
  ADMIN: [
    "platform.auth",
    "platform.org.read",
    "platform.org.manage",
    "platform.membership.read",
    "platform.membership.manage",
    "platform.rbac.read",
    "platform.audit.read",
    "setup.read",
    "setup.write",
    "contacts.read",
    "contacts.write",
    "connectors.read",
    "connectors.write",
    "files.read",
    "files.write",
    "sales.read",
    "sales.write",
    "sales.credit_notes.read",
    "sales.credit_notes.write",
    "sales.repeating.read",
    "sales.repeating.write",
    "purchases.read",
    "purchases.write",
    "purchases.credit_notes.read",
    "purchases.credit_notes.write",
    "purchases.orders.read",
    "purchases.orders.write",
    "purchases.repeating.read",
    "purchases.repeating.write",
    "quotes.read",
    "quotes.write",
    "quotes.convert",
    "compliance.read",
    "compliance.write",
    "compliance.report",
    "billing.read",
    "billing.write",
    "assets.read",
    "assets.write",
    "assets.depreciate",
    "inventory.read",
    "inventory.write",
    "journals.read",
    "journals.write",
    "connectors.sync",
    "shell.home.read",
    "shell.accounting.read",
    "shell.e_invoice.read",
    "shell.reports.read",
    "shell.charts.read",
    "shell.contacts.read",
    "shell.audit_report.read",
    "shell.settings.read",
    "shell.subscription.read",
    "shell.task_management.read",
    "shell.applications.read",
    "shell.list_tracking.read",
  ],
  ACCOUNTANT: [
    "platform.auth",
    "platform.org.read",
    "platform.membership.read",
    "platform.rbac.read",
    "setup.read",
    "setup.write",
    "contacts.read",
    "contacts.write",
    "connectors.read",
    "files.read",
    "files.write",
    "sales.read",
    "sales.write",
    "sales.credit_notes.read",
    "sales.credit_notes.write",
    "sales.repeating.read",
    "sales.repeating.write",
    "purchases.read",
    "purchases.write",
    "purchases.credit_notes.read",
    "purchases.credit_notes.write",
    "purchases.orders.read",
    "purchases.orders.write",
    "purchases.repeating.read",
    "purchases.repeating.write",
    "quotes.read",
    "quotes.write",
    "quotes.convert",
    "compliance.read",
    "billing.read",
    "assets.read",
    "assets.write",
    "assets.depreciate",
    "inventory.read",
    "inventory.write",
    "journals.read",
    "journals.write",
    "connectors.sync",
    "shell.home.read",
    "shell.accounting.read",
    "shell.reports.read",
    "shell.charts.read",
    "shell.contacts.read",
    "shell.settings.read",
  ],
  COMPLIANCE_OFFICER: [
    "platform.auth",
    "platform.org.read",
    "platform.membership.read",
    "platform.rbac.read",
    "platform.audit.read",
    "setup.read",
    "contacts.read",
    "connectors.read",
    "files.read",
    "sales.read",
    "sales.credit_notes.read",
    "sales.repeating.read",
    "purchases.read",
    "purchases.credit_notes.read",
    "purchases.orders.read",
    "purchases.repeating.read",
    "quotes.read",
    "compliance.read",
    "compliance.write",
    "compliance.report",
    "billing.read",
    "assets.read",
    "inventory.read",
    "journals.read",
    "shell.home.read",
    "shell.accounting.read",
    "shell.e_invoice.read",
    "shell.reports.read",
    "shell.audit_report.read",
    "shell.settings.read",
  ],
  VIEWER: [
    "platform.auth",
    "platform.org.read",
    "platform.membership.read",
    "platform.rbac.read",
    "contacts.read",
    "files.read",
    "sales.read",
    "sales.credit_notes.read",
    "sales.repeating.read",
    "purchases.read",
    "purchases.credit_notes.read",
    "purchases.orders.read",
    "purchases.repeating.read",
    "quotes.read",
    "compliance.read",
    "billing.read",
    "assets.read",
    "inventory.read",
    "journals.read",
    "shell.home.read",
    "shell.accounting.read",
    "shell.reports.read",
    "shell.charts.read",
    "shell.contacts.read",
  ],
};

async function clearDatabase(client: PrismaClient) {
  await client.auditLog.deleteMany();
  await client.passwordResetToken.deleteMany();
  await client.invitationToken.deleteMany();
  await client.session.deleteMany();
  await client.depreciationRun.deleteMany();
  await client.fixedAsset.deleteMany();
  await client.stockMovement.deleteMany();
  await client.inventoryItem.deleteMany();
  await client.journalEntryLine.deleteMany();
  await client.journalEntry.deleteMany();
  await client.billingInvoice.deleteMany();
  await client.stripeSubscription.deleteMany();
  await client.stripeCustomer.deleteMany();
  await client.complianceEvent.deleteMany();
  await client.zatcaSubmissionAttempt.deleteMany();
  await client.zatcaSubmission.deleteMany();
  await client.reportedDocument.deleteMany();
  await client.complianceDocument.deleteMany();
  await client.complianceOnboarding.deleteMany();
  await client.invoiceStatusEvent.deleteMany();
  await client.invoicePayment.deleteMany();
  await client.salesCreditNoteLine.deleteMany();
  await client.repeatingInvoiceLine.deleteMany();
  await client.salesInvoiceLine.deleteMany();
  await client.billPayment.deleteMany();
  await client.purchaseCreditNoteLine.deleteMany();
  await client.purchaseOrderLine.deleteMany();
  await client.repeatingBillLine.deleteMany();
  await client.purchaseBillLine.deleteMany();
  await client.quoteLine.deleteMany();
  await client.salesCreditNote.deleteMany();
  await client.repeatingInvoice.deleteMany();
  await client.salesInvoice.deleteMany();
  await client.purchaseCreditNote.deleteMany();
  await client.purchaseOrder.deleteMany();
  await client.repeatingBill.deleteMany();
  await client.purchaseBill.deleteMany();
  await client.quote.deleteMany();
  await client.storedFile.deleteMany();
  await client.connectorSyncLog.deleteMany();
  await client.connectorAccount.deleteMany();
  await client.contactNumber.deleteMany();
  await client.address.deleteMany();
  await client.contactGroupMember.deleteMany();
  await client.contact.deleteMany();
  await client.contactGroup.deleteMany();
  await client.emailTemplate.deleteMany();
  await client.account.deleteMany();
  await client.bankAccount.deleteMany();
  await client.trackingOption.deleteMany();
  await client.trackingCategory.deleteMany();
  await client.organizationTaxDetail.deleteMany();
  await client.taxRate.deleteMany();
  await client.currency.deleteMany();
  await client.authIdentity.deleteMany();
  await client.membership.deleteMany();
  await client.organizationSetting.deleteMany();
  await client.rolePermission.deleteMany();
  await client.permission.deleteMany();
  await client.role.deleteMany();
  await client.user.deleteMany();
  await client.organization.deleteMany();
  await resetSeedStorage();
}

function toMoney(value: number) {
  return value.toFixed(2);
}

function buildLine(line: {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId?: string | null;
  taxRateName?: string | null;
  taxRatePercent: number;
}) {
  const lineSubtotal = line.quantity * line.unitPrice;
  const lineTax = (lineSubtotal * line.taxRatePercent) / 100;
  const lineTotal = lineSubtotal + lineTax;

  return {
    description: line.description,
    quantity: toMoney(line.quantity),
    unitPrice: toMoney(line.unitPrice),
    taxRateId: line.taxRateId ?? null,
    taxRateName: line.taxRateName ?? null,
    taxRatePercent: toMoney(line.taxRatePercent),
    lineSubtotal: toMoney(lineSubtotal),
    lineTax: toMoney(lineTax),
    lineTotal: toMoney(lineTotal),
  };
}

async function seedRoles(client: PrismaClient) {
  const permissions = await Promise.all(
    permissionKeys.map((key) =>
      client.permission.create({
        data: {
          key,
          description: `Permission ${key}`,
        },
      }),
    ),
  );

  const roles = await Promise.all(
    roleKeys.map((key) =>
      client.role.create({
        data: {
          key,
          name: key.replaceAll("_", " "),
        },
      }),
    ),
  );

  for (const role of roles) {
    for (const permission of permissions.filter((entry) =>
      rolePermissionMap[role.key].includes(entry.key),
    )) {
      await client.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  return { permissions, roles };
}

export async function seedDatabase(client: PrismaClient) {
  await clearDatabase(client);
  const passwordHash = await bcrypt.hash(
    "Password123!",
    env.AUTH_BCRYPT_ROUNDS,
  );
  const { roles } = await seedRoles(client);

  const organizations = await Promise.all([
    client.organization.create({
      data: {
        name: "Nomad Events Arabia Limited",
        slug: "nomad-events",
      },
    }),
    client.organization.create({
      data: {
        name: "Nomad Labs",
        slug: "nomad-labs",
      },
    }),
  ]);

  const organizationBySlug = Object.fromEntries(
    organizations.map((organization) => [organization.slug, organization]),
  );

  for (const organization of organizations) {
    await client.organizationSetting.createMany({
      data: [
        {
          organizationId: organization.id,
          key: "week1.locale.default",
          value: { locale: "en", rtlReady: true },
        },
        {
          organizationId: organization.id,
          key: "week2.invoice.settings",
          value: {
            invoicePrefix:
              organization.slug === "nomad-events" ? "INV-NE" : "INV-NL",
            defaultDueDays: 15,
            footerNote: "Thank you for choosing Daftar.",
            whatsappEnabled: organization.slug === "nomad-events",
          },
        },
        {
          organizationId: organization.id,
          key: "week2.custom.settings",
          value: {
            defaultLanguage: "en",
            timezone:
              organization.slug === "nomad-events"
                ? "Asia/Riyadh"
                : "Asia/Karachi",
            fiscalYearStartMonth: 1,
            notes:
              organization.slug === "nomad-events"
                ? "Primary Saudi operating entity."
                : "Internal product and support entity.",
          },
        },
      ],
    });
  }

  const createdUsers = new Map<string, { id: string; roleKey: RoleKey }>();

  for (const seedUser of seedUsers) {
    const user = await client.user.create({
      data: {
        email: seedUser.email,
        fullName: seedUser.fullName,
        authIdentities: {
          create: {
            provider: "LOCAL",
            identifier: seedUser.email.toLowerCase(),
            secretHash: passwordHash,
          },
        },
      },
    });

    const organization = organizationBySlug[seedUser.organizationSlug];
    const role = roles.find((entry) => entry.key === seedUser.roleKey)!;

    await client.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        roleId: role.id,
        status: "ACTIVE",
      },
    });

    if (seedUser.email === "owner@daftar.local") {
      await client.membership.create({
        data: {
          userId: user.id,
          organizationId: organizationBySlug["nomad-labs"].id,
          roleId: role.id,
          status: "ACTIVE",
        },
      });
    }

    createdUsers.set(seedUser.email, {
      id: user.id,
      roleKey: seedUser.roleKey,
    });
  }

  const ownerUserId = createdUsers.get("owner@daftar.local")!.id;
  const accountantRole = roles.find((entry) => entry.key === "ACCOUNTANT")!;

  const invitedUser = await client.user.create({
    data: {
      email: "invited.accountant@daftar.local",
      fullName: "Invited Accountant",
      status: "INVITED"
    }
  });

  const invitedMembership = await client.membership.create({
    data: {
      userId: invitedUser.id,
      organizationId: organizationBySlug["nomad-events"].id,
      roleId: accountantRole.id,
      status: "INVITED"
    }
  });

  await client.invitationToken.create({
    data: {
      organizationId: organizationBySlug["nomad-events"].id,
      membershipId: invitedMembership.id,
      email: invitedUser.email,
      fullName: invitedUser.fullName,
      tokenHash: hashToken(seededInvitationToken),
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    }
  });

  for (const organization of organizations) {
    const isPrimary = organization.slug === "nomad-events";

    await client.currency.createMany({
      data: [
        {
          organizationId: organization.id,
          code: "SAR",
          name: "Saudi Riyal",
          symbol: "SAR",
          exchangeRate: "1.000000",
          isBase: isPrimary,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "USD",
          name: "US Dollar",
          symbol: "USD",
          exchangeRate: isPrimary ? "3.750000" : "1.000000",
          isBase: !isPrimary,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "AED",
          name: "UAE Dirham",
          symbol: "AED",
          exchangeRate: "1.020000",
          isBase: false,
          isActive: true,
        },
      ],
    });

    await client.taxRate.createMany({
      data: [
        {
          organizationId: organization.id,
          name: "VAT 15%",
          code: "VAT15",
          rate: "15.00",
          scope: "BOTH",
          isDefault: true,
          isActive: true,
        },
        {
          organizationId: organization.id,
          name: "Zero Rated",
          code: "ZERO",
          rate: "0.00",
          scope: "BOTH",
          isDefault: false,
          isActive: true,
        },
        {
          organizationId: organization.id,
          name: "Exempt",
          code: "EXEMPT",
          rate: "0.00",
          scope: "BOTH",
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const vatRate = await client.taxRate.findFirstOrThrow({
      where: { organizationId: organization.id, code: "VAT15" },
    });
    const zeroRate = await client.taxRate.findFirstOrThrow({
      where: { organizationId: organization.id, code: "ZERO" },
    });

    await client.organizationTaxDetail.create({
      data: {
        organizationId: organization.id,
        legalName: organization.name,
        taxNumber: isPrimary ? "300123456700003" : "310987654300003",
        countryCode: isPrimary ? "SA" : "PK",
        taxOffice: isPrimary ? "Riyadh ZATCA" : "Karachi Regional",
        registrationNumber: isPrimary ? "CR-1010998877" : "SECP-982344",
        addressLine1: isPrimary ? "Olaya Street" : "Clifton Block 8",
        addressLine2: isPrimary ? "Office 402" : "Suite 12A",
        city: isPrimary ? "Riyadh" : "Karachi",
        postalCode: isPrimary ? "12211" : "75600",
      },
    });

    const branchTracking = await client.trackingCategory.create({
      data: {
        organizationId: organization.id,
        name: "Branch",
        description: "Operational branch tracking.",
        isActive: true,
      },
    });

    const departmentTracking = await client.trackingCategory.create({
      data: {
        organizationId: organization.id,
        name: "Department",
        description: "Team and cost center split.",
        isActive: true,
      },
    });

    await client.trackingOption.createMany({
      data: [
        {
          trackingCategoryId: branchTracking.id,
          name: isPrimary ? "Riyadh" : "Karachi",
          color: isPrimary ? "#0f766e" : "#1d4ed8",
          isActive: true,
        },
        {
          trackingCategoryId: branchTracking.id,
          name: isPrimary ? "Jeddah" : "Lahore",
          color: isPrimary ? "#b45309" : "#7c3aed",
          isActive: true,
        },
        {
          trackingCategoryId: departmentTracking.id,
          name: "Operations",
          color: "#0f172a",
          isActive: true,
        },
        {
          trackingCategoryId: departmentTracking.id,
          name: "Sales",
          color: "#be123c",
          isActive: true,
        },
      ],
    });

    await client.bankAccount.createMany({
      data: [
        {
          organizationId: organization.id,
          name: "Main Operating Account",
          bankName: isPrimary ? "Saudi National Bank" : "Meezan Bank",
          accountName: organization.name,
          accountNumberMasked: isPrimary ? "****7788" : "****1122",
          iban: isPrimary ? "SA4420000001234567890123" : null,
          currencyCode: isPrimary ? "SAR" : "USD",
          openingBalance: isPrimary ? "225000.00" : "95000.00",
          isPrimary: true,
          isActive: true,
        },
        {
          organizationId: organization.id,
          name: "Payroll Reserve",
          bankName: isPrimary ? "Al Rajhi Bank" : "Bank Alfalah",
          accountName: `${organization.name} Reserve`,
          accountNumberMasked: isPrimary ? "****5544" : "****8822",
          iban: isPrimary ? "SA1120000001234567890456" : null,
          currencyCode: isPrimary ? "SAR" : "USD",
          openingBalance: isPrimary ? "78000.00" : "31000.00",
          isPrimary: false,
          isActive: true,
        },
      ],
    });
    const bankAccounts = await client.bankAccount.findMany({
      where: { organizationId: organization.id },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    });
    const primaryBankAccount = bankAccounts[0];
    const reserveBankAccount = bankAccounts[1];

    if (!primaryBankAccount || !reserveBankAccount) {
      throw new Error(`Missing seeded bank accounts for ${organization.slug}.`);
    }

    await client.account.createMany({
      data: [
        {
          organizationId: organization.id,
          code: "1000",
          name: "Cash at Bank",
          type: "ASSET",
          description: "Primary bank holdings.",
          isSystem: true,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "1100",
          name: "Accounts Receivable",
          type: "ASSET",
          description: "Amounts due from customers.",
          isSystem: true,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "2000",
          name: "Accounts Payable",
          type: "LIABILITY",
          description: "Amounts due to suppliers.",
          isSystem: true,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "4000",
          name: "Consulting Revenue",
          type: "REVENUE",
          description: "Primary service revenue.",
          isSystem: false,
          isActive: true,
        },
        {
          organizationId: organization.id,
          code: "5100",
          name: "Office Operations",
          type: "EXPENSE",
          description: "General operating expenses.",
          isSystem: false,
          isActive: true,
        },
      ],
    });

    const accountByCode = Object.fromEntries(
      (
        await client.account.findMany({
          where: { organizationId: organization.id },
        })
      ).map((account) => [account.code, account]),
    );

    const inventoryItems = await Promise.all([
      client.inventoryItem.create({
        data: {
          organizationId: organization.id,
          itemCode: isPrimary ? "ITM-1001" : "ITM-2001",
          itemName: isPrimary ? "Backdrop Panel Set" : "Camera Tripod",
          description: isPrimary
            ? "Portable branded backdrop panels for live events."
            : "Tripod kit used for studio capture work.",
          costPrice: isPrimary ? "850.00" : "120.00",
          salePrice: isPrimary ? "1100.00" : "180.00",
          quantityOnHand: isPrimary ? "14.00" : "6.00",
        },
      }),
      client.inventoryItem.create({
        data: {
          organizationId: organization.id,
          itemCode: isPrimary ? "ITM-1002" : "ITM-2002",
          itemName: isPrimary ? "LED Uplight Kit" : "Wireless Mic Pack",
          description: isPrimary
            ? "Rental-ready uplight kit for venue setups."
            : "Reusable microphone pack for interview and support calls.",
          costPrice: isPrimary ? "620.00" : "95.00",
          salePrice: isPrimary ? "950.00" : "145.00",
          quantityOnHand: isPrimary ? "8.00" : "11.00",
        },
      }),
    ]);

    await client.stockMovement.createMany({
      data: [
        {
          organizationId: organization.id,
          inventoryItemId: inventoryItems[0].id,
          movementType: "OPENING",
          quantityDelta: isPrimary ? "10.00" : "5.00",
          quantityAfter: isPrimary ? "10.00" : "5.00",
          reference: "OPENING-BALANCE",
          notes: "Opening inventory balance.",
          createdAt: new Date("2026-04-01T08:00:00.000Z"),
        },
        {
          organizationId: organization.id,
          inventoryItemId: inventoryItems[0].id,
          movementType: "ADJUSTMENT_IN",
          quantityDelta: isPrimary ? "4.00" : "1.00",
          quantityAfter: isPrimary ? "14.00" : "6.00",
          reference: "APR-RESTOCK",
          notes: "Stock received and counted into inventory.",
          createdAt: new Date("2026-04-09T11:30:00.000Z"),
        },
        {
          organizationId: organization.id,
          inventoryItemId: inventoryItems[1].id,
          movementType: "OPENING",
          quantityDelta: isPrimary ? "12.00" : "14.00",
          quantityAfter: isPrimary ? "12.00" : "14.00",
          reference: "OPENING-BALANCE",
          notes: "Opening inventory balance.",
          createdAt: new Date("2026-04-01T08:15:00.000Z"),
        },
        {
          organizationId: organization.id,
          inventoryItemId: inventoryItems[1].id,
          movementType: "ADJUSTMENT_OUT",
          quantityDelta: isPrimary ? "-4.00" : "-3.00",
          quantityAfter: isPrimary ? "8.00" : "11.00",
          reference: "APR-COUNT",
          notes: "Cycle count adjustment after usage review.",
          createdAt: new Date("2026-04-12T16:45:00.000Z"),
        },
      ],
    });

    await client.journalEntry.create({
      data: {
        organizationId: organization.id,
        journalNumber: "MJ-0001",
        reference: isPrimary ? "APR-ACCRUAL" : "APR-SUPPLIER",
        entryDate: new Date("2026-04-03T00:00:00.000Z"),
        memo: isPrimary
          ? "Accrued venue production costs before supplier payment."
          : "Accrued studio support costs before supplier payment.",
        totalDebit: isPrimary ? "2400.00" : "900.00",
        totalCredit: isPrimary ? "2400.00" : "900.00",
        lines: {
          create: [
            {
              accountId: accountByCode["5100"].id,
              description: "Operations expense accrual",
              debit: isPrimary ? "2400.00" : "900.00",
              credit: "0.00",
              sortOrder: 0,
            },
            {
              accountId: accountByCode["2000"].id,
              description: "Supplier payable accrual",
              debit: "0.00",
              credit: isPrimary ? "2400.00" : "900.00",
              sortOrder: 1,
            },
          ],
        },
      },
    });

    await client.journalEntry.create({
      data: {
        organizationId: organization.id,
        journalNumber: "MJ-0002",
        reference: isPrimary ? "APR-REV-ADJ" : "APR-CLIENT-ADJ",
        entryDate: new Date("2026-04-10T00:00:00.000Z"),
        memo: isPrimary
          ? "Recognized earned consulting revenue not yet invoiced."
          : "Recognized earned product support revenue not yet invoiced.",
        totalDebit: isPrimary ? "5200.00" : "1600.00",
        totalCredit: isPrimary ? "5200.00" : "1600.00",
        lines: {
          create: [
            {
              accountId: accountByCode["1100"].id,
              description: "Customer receivable accrual",
              debit: isPrimary ? "5200.00" : "1600.00",
              credit: "0.00",
              sortOrder: 0,
            },
            {
              accountId: accountByCode["4000"].id,
              description: "Revenue recognition adjustment",
              debit: "0.00",
              credit: isPrimary ? "5200.00" : "1600.00",
              sortOrder: 1,
            },
          ],
        },
      },
    });

    await client.emailTemplate.createMany({
      data: [
        {
          organizationId: organization.id,
          key: "invoice-issued",
          name: "Invoice Issued",
          subject: `${organization.name}: your invoice is ready`,
          body: "Please find your invoice attached. Thank you for your business.",
          isDefault: true,
          isActive: true,
        },
          {
            organizationId: organization.id,
            key: "payment-reminder",
            name: "Payment Reminder",
            subject: `${organization.name}: payment reminder`,
            body: "This is a reminder that payment is due soon.",
            isDefault: false,
            isActive: true,
          },
          {
            organizationId: organization.id,
            key: "team-invitation",
            name: "Team Invitation",
            subject: `${organization.name}: you're invited to Daftar`,
            body: [
              "Hello {{fullName}},",
              "",
              "You've been invited to {{organizationName}} as {{roleKey}}.",
              "Open this secure link to accept the invitation:",
              "{{actionUrl}}"
            ].join("\n"),
            isDefault: false,
            isActive: true,
          },
          {
            organizationId: organization.id,
            key: "password-reset",
            name: "Password Reset",
            subject: "Daftar: reset your password",
            body: [
              "Hello {{fullName}},",
              "",
              "We received a request to reset your password.",
              "Open this secure link to continue:",
              "{{actionUrl}}"
            ].join("\n"),
            isDefault: false,
            isActive: true,
          },
        ],
      });

    const vipCustomers = await client.contactGroup.create({
      data: {
        organizationId: organization.id,
        name: "VIP Customers",
        description: "Priority customers for the account team.",
      },
    });

    const strategicSuppliers = await client.contactGroup.create({
      data: {
        organizationId: organization.id,
        name: "Strategic Suppliers",
        description: "Preferred supply partners.",
      },
    });

    const customers = await Promise.all([
      client.contact.create({
        data: {
          organizationId: organization.id,
          displayName: isPrimary ? "Al Noor Hospitality" : "Orbit Support",
          companyName: isPrimary
            ? "Al Noor Hospitality LLC"
            : "Orbit Support Ltd",
          email: isPrimary ? "ap@alnoor.example" : "finance@orbit.example",
          taxNumber: isPrimary ? "310777888900003" : "PK-2299188-7",
          customerCode: isPrimary ? "CUS-1001" : "CUS-2001",
          isCustomer: true,
          isSupplier: false,
          currencyCode: isPrimary ? "SAR" : "USD",
          paymentTermsDays: 30,
          notes: "Key account handled by the finance lead.",
          receivableBalance: isPrimary ? "18500.00" : "6200.00",
          payableBalance: "0.00",
        },
      }),
      client.contact.create({
        data: {
          organizationId: organization.id,
          displayName: isPrimary
            ? "Summit Retail Arabia"
            : "Vertex Client Services",
          companyName: isPrimary
            ? "Summit Retail Arabia"
            : "Vertex Client Services",
          email: isPrimary
            ? "billing@summit.example"
            : "accounts@vertex.example",
          taxNumber: isPrimary ? "310121212100003" : "PK-6611334-2",
          customerCode: isPrimary ? "CUS-1002" : "CUS-2002",
          isCustomer: true,
          isSupplier: false,
          currencyCode: isPrimary ? "SAR" : "USD",
          paymentTermsDays: 14,
          notes: "Fast-paying customer with recurring work.",
          receivableBalance: isPrimary ? "7200.00" : "3900.00",
          payableBalance: "0.00",
        },
      }),
    ]);

    const suppliers = await Promise.all([
      client.contact.create({
        data: {
          organizationId: organization.id,
          displayName: isPrimary
            ? "Desert Print Works"
            : "Blue Harbor Services",
          companyName: isPrimary
            ? "Desert Print Works"
            : "Blue Harbor Services",
          email: isPrimary
            ? "accounts@desertprint.example"
            : "billing@blueharbor.example",
          taxNumber: isPrimary ? "300009988700003" : "PK-4411223-9",
          supplierCode: isPrimary ? "SUP-3001" : "SUP-4001",
          isCustomer: false,
          isSupplier: true,
          currencyCode: isPrimary ? "SAR" : "USD",
          paymentTermsDays: 21,
          notes: "Preferred supplier for branded materials.",
          receivableBalance: "0.00",
          payableBalance: isPrimary ? "6400.00" : "3100.00",
        },
      }),
      client.contact.create({
        data: {
          organizationId: organization.id,
          displayName: isPrimary ? "Riyadh Venue Tech" : "North Star Hosting",
          companyName: isPrimary ? "Riyadh Venue Tech" : "North Star Hosting",
          email: isPrimary
            ? "finance@venue-tech.example"
            : "finance@northstar.example",
          taxNumber: isPrimary ? "300887766500003" : "PK-7788991-0",
          supplierCode: isPrimary ? "SUP-3002" : "SUP-4002",
          isCustomer: false,
          isSupplier: true,
          currencyCode: isPrimary ? "SAR" : "USD",
          paymentTermsDays: 30,
          notes: "Supports venue operations and infrastructure.",
          receivableBalance: "0.00",
          payableBalance: isPrimary ? "12800.00" : "5400.00",
        },
      }),
    ]);

    for (const contact of [...customers, ...suppliers]) {
      await client.address.createMany({
        data: [
          {
            contactId: contact.id,
            type: "BILLING",
            line1: isPrimary ? "King Fahd Road" : "Shahrah-e-Faisal",
            line2: contact.displayName,
            city: isPrimary ? "Riyadh" : "Karachi",
            state: isPrimary ? "Riyadh Province" : "Sindh",
            postalCode: isPrimary ? "12271" : "75350",
            countryCode: isPrimary ? "SA" : "PK",
          },
          {
            contactId: contact.id,
            type: "DELIVERY",
            line1: isPrimary ? "Warehouse District" : "Site Office",
            line2: "Receiving Dock",
            city: isPrimary ? "Jeddah" : "Lahore",
            state: isPrimary ? "Makkah" : "Punjab",
            postalCode: isPrimary ? "21442" : "54000",
            countryCode: isPrimary ? "SA" : "PK",
          },
        ],
      });

      await client.contactNumber.createMany({
        data: [
          {
            contactId: contact.id,
            label: "Main",
            phoneNumber: isPrimary ? "+966555000111" : "+923001110222",
          },
          {
            contactId: contact.id,
            label: "Finance",
            phoneNumber: isPrimary ? "+966555000222" : "+923001110333",
          },
        ],
      });
    }

    await client.contactGroupMember.createMany({
      data: [
        {
          contactId: customers[0].id,
          groupId: vipCustomers.id,
        },
        {
          contactId: suppliers[0].id,
          groupId: strategicSuppliers.id,
        },
      ],
    });

    const xeroAccount = await client.connectorAccount.create({
      data: {
        organizationId: organization.id,
        provider: "XERO",
        displayName: `${organization.name} Xero`,
        status: isPrimary ? "CONNECTED" : "PENDING",
        externalTenantId: isPrimary ? "xero-tenant-001" : null,
        scopes: ["contacts.read", "invoices.write", "accounts.read"],
        connectedByUserId: ownerUserId,
        connectedAt: isPrimary ? new Date("2026-04-10T08:00:00.000Z") : null,
        lastSyncedAt: isPrimary ? new Date("2026-04-11T15:45:00.000Z") : null,
        metadata: {
          region: isPrimary ? "sa" : "pk",
        },
      },
    });

    const qboAccount = await client.connectorAccount.create({
      data: {
        organizationId: organization.id,
        provider: "QUICKBOOKS_ONLINE",
        displayName: `${organization.name} QuickBooks`,
        status: "ERROR",
        externalTenantId: `qbo-${organization.slug}`,
        scopes: ["customers.read", "vendors.read"],
        connectedByUserId: ownerUserId,
        connectedAt: new Date("2026-04-09T09:30:00.000Z"),
        metadata: {
          lastError: "Token refresh required",
        },
      },
    });

    const zohoAccount = await client.connectorAccount.create({
      data: {
        organizationId: organization.id,
        provider: "ZOHO_BOOKS",
        displayName: `${organization.name} Zoho Books`,
        status: "DISCONNECTED",
        externalTenantId: `zoho-${organization.slug}`,
        scopes: ["contacts.read"],
        connectedByUserId: ownerUserId,
        metadata: {
          mode: "oauth-ready",
        },
      },
    });

    await client.connectorSyncLog.createMany({
      data: [
        {
          organizationId: organization.id,
          connectorAccountId: xeroAccount.id,
          direction: "EXPORT",
          scope: "contacts",
          status: "SUCCESS",
          retryable: false,
          message: "Exported initial contacts baseline.",
          startedAt: new Date("2026-04-11T15:30:00.000Z"),
          finishedAt: new Date("2026-04-11T15:45:00.000Z"),
        },
        {
          organizationId: organization.id,
          connectorAccountId: qboAccount.id,
          direction: "IMPORT",
          scope: "tax-rates",
          status: "FAILED",
          retryable: true,
          message: "Refresh token expired before bootstrap import finished.",
          startedAt: new Date("2026-04-11T14:00:00.000Z"),
          finishedAt: new Date("2026-04-11T14:02:00.000Z"),
        },
        {
          organizationId: organization.id,
          connectorAccountId: zohoAccount.id,
          direction: "EXPORT",
          scope: "accounts",
          status: "PENDING",
          retryable: true,
          message: "Ready for first export after authorization.",
          startedAt: new Date("2026-04-12T08:00:00.000Z"),
          finishedAt: null,
        },
      ],
    });

    await client.storedFile.createMany({
      data: [
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/contacts/${customers[0].id}/welcome-pack.pdf`,
          originalFileName: "welcome-pack.pdf",
          mimeType: "application/pdf",
          sizeBytes: 248112,
          checksumSha256: "welcome-pack-sha256",
          relatedType: "contact",
          relatedId: customers[0].id,
          metadata: {
            label: "Customer welcome pack",
          },
        },
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/connectors/${xeroAccount.id}/bootstrap-export.json`,
          originalFileName: "bootstrap-export.json",
          mimeType: "application/json",
          sizeBytes: 8421,
          checksumSha256: "bootstrap-export-sha256",
          relatedType: "connector-account",
          relatedId: xeroAccount.id,
          metadata: {
            label: "Connector bootstrap manifest",
          },
        },
      ],
    });
    await writeSeedStoredFiles([
      {
        objectKey: `${organization.slug}/contacts/${customers[0].id}/welcome-pack.pdf`,
        contents: `Welcome pack for ${customers[0].displayName}`,
        sizeBytes: 248112,
      },
      {
        objectKey: `${organization.slug}/connectors/${xeroAccount.id}/bootstrap-export.json`,
        contents: JSON.stringify(
          {
            provider: "XERO",
            organization: organization.slug,
            exportedAt: "2026-04-11T15:45:00.000Z",
          },
          null,
          2,
        ),
        sizeBytes: 8421,
      },
    ]);

    const invoiceOneLines = [
      buildLine({
        description: "Event management retainer",
        quantity: 1,
        unitPrice: isPrimary ? 12000 : 4200,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
      buildLine({
        description: "On-site coordination",
        quantity: 2,
        unitPrice: isPrimary ? 1500 : 650,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const invoiceOneSubtotal = invoiceOneLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const invoiceOneTax = invoiceOneLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const invoiceOneTotal = invoiceOneSubtotal + invoiceOneTax;
    const invoiceOnePaid = isPrimary ? 6500 : 1200;

    const invoiceOne = await client.salesInvoice.create({
      data: {
        organizationId: organization.id,
        contactId: customers[0].id,
        invoiceNumber: isPrimary ? "INV-NE-0001" : "INV-NL-0001",
        status: "PARTIALLY_PAID",
        complianceInvoiceKind: "STANDARD",
        issueDate: new Date("2026-04-02T09:00:00.000Z"),
        dueDate: new Date("2026-04-20T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Primary operating invoice for recurring services.",
        subtotal: toMoney(invoiceOneSubtotal),
        taxTotal: toMoney(invoiceOneTax),
        total: toMoney(invoiceOneTotal),
        amountPaid: toMoney(invoiceOnePaid),
        amountDue: toMoney(invoiceOneTotal - invoiceOnePaid),
        lines: {
          create: invoiceOneLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    await client.invoicePayment.create({
      data: {
        salesInvoiceId: invoiceOne.id,
        bankAccountId: primaryBankAccount.id,
        paymentDate: new Date("2026-04-10T12:00:00.000Z"),
        amount: toMoney(invoiceOnePaid),
        method: "Bank Transfer",
        reference: isPrimary ? "NE-PMT-001" : "NL-PMT-001",
        notes: "Partial advance received.",
      },
    });

    await client.invoiceStatusEvent.createMany({
      data: [
        {
          salesInvoiceId: invoiceOne.id,
          actorUserId: ownerUserId,
          action: "sales.invoice.created",
          toStatus: "ISSUED",
          message: "Invoice issued to customer.",
        },
        {
          salesInvoiceId: invoiceOne.id,
          actorUserId: ownerUserId,
          action: "sales.invoice.payment_recorded",
          fromStatus: "ISSUED",
          toStatus: "PARTIALLY_PAID",
          message: "Partial payment posted.",
        },
      ],
    });

    const invoiceTwoLines = [
      buildLine({
        description: "Activation design package",
        quantity: 1,
        unitPrice: isPrimary ? 7000 : 2600,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
      buildLine({
        description: "Campaign wrap report",
        quantity: 1,
        unitPrice: isPrimary ? 1200 : 450,
        taxRateId: zeroRate.id,
        taxRateName: zeroRate.name,
        taxRatePercent: Number(zeroRate.rate),
      }),
    ];
    const invoiceTwoSubtotal = invoiceTwoLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const invoiceTwoTax = invoiceTwoLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const invoiceTwoTotal = invoiceTwoSubtotal + invoiceTwoTax;

    const invoiceTwo = await client.salesInvoice.create({
      data: {
        organizationId: organization.id,
        contactId: customers[1].id,
        invoiceNumber: isPrimary ? "INV-NE-0002" : "INV-NL-0002",
        status: "PAID",
        complianceInvoiceKind: isPrimary ? "STANDARD" : "SIMPLIFIED",
        issueDate: new Date("2026-04-05T09:00:00.000Z"),
        dueDate: new Date("2026-04-18T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Completed campaign package.",
        subtotal: toMoney(invoiceTwoSubtotal),
        taxTotal: toMoney(invoiceTwoTax),
        total: toMoney(invoiceTwoTotal),
        amountPaid: toMoney(invoiceTwoTotal),
        amountDue: "0.00",
        lines: {
          create: invoiceTwoLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    await client.invoicePayment.create({
      data: {
        salesInvoiceId: invoiceTwo.id,
        bankAccountId: reserveBankAccount.id,
        paymentDate: new Date("2026-04-08T15:00:00.000Z"),
        amount: toMoney(invoiceTwoTotal),
        method: "Bank Transfer",
        reference: isPrimary ? "NE-PMT-002" : "NL-PMT-002",
        notes: "Settled in full.",
      },
    });

    await client.invoiceStatusEvent.createMany({
      data: [
        {
          salesInvoiceId: invoiceTwo.id,
          actorUserId: ownerUserId,
          action: "sales.invoice.created",
          toStatus: "ISSUED",
          message: "Invoice issued to customer.",
        },
        {
          salesInvoiceId: invoiceTwo.id,
          actorUserId: ownerUserId,
          action: "sales.invoice.payment_recorded",
          fromStatus: "ISSUED",
          toStatus: "PAID",
          message: "Invoice settled in full.",
        },
      ],
    });

    const complianceOnboarding = await client.complianceOnboarding.create({
      data: {
        organizationId: organization.id,
        environment: "Sandbox",
        deviceName: `${organization.name} EGS Unit`,
        deviceSerial: `egs-${organization.slug}`,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        csid: `sandbox-${organization.slug}`,
        certificateId: `cert-${organization.slug}`,
        secretFingerprint: `${organization.slug}-secret`,
        certificateIssuedAt: new Date("2026-04-01T09:00:00.000Z"),
        certificateExpiresAt: new Date("2027-04-01T09:00:00.000Z"),
        lastActivatedAt: new Date("2026-04-01T09:00:00.000Z"),
        lastRenewedAt: new Date("2026-04-01T09:00:00.000Z"),
        metadata: {
          publicKey: "seed-public-key",
          xmlSignature: "seed-xml-signature",
          technicalStamp: "seed-technical-stamp",
        },
      },
    });

    const complianceDocument = await client.complianceDocument.create({
      data: {
        organizationId: organization.id,
        salesInvoiceId: invoiceTwo.id,
        onboardingId: complianceOnboarding.id,
        invoiceKind: invoiceTwo.complianceInvoiceKind,
        submissionFlow:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARANCE" : "REPORTING",
        invoiceCounter: 1,
        uuid: `${organization.slug}-compliance-0001`,
        qrPayload: Buffer.from(
          `${organization.slug}:${invoiceTwo.invoiceNumber}`,
        ).toString("base64"),
        previousHash: null,
        currentHash: `${organization.slug}-hash-0001`,
        xmlContent: `<Invoice>${invoiceTwo.invoiceNumber}</Invoice>`,
        status:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
        lastSubmissionStatus: "ACCEPTED",
        lastSubmittedAt: new Date("2026-04-09T09:15:00.000Z"),
        lastError: null,
        ...(invoiceTwo.complianceInvoiceKind === "STANDARD"
          ? { clearedAt: new Date("2026-04-09T09:15:00.000Z") }
          : { reportedAt: new Date("2026-04-09T09:15:00.000Z") }),
      },
    });

    const zatcaSubmission = await client.zatcaSubmission.create({
      data: {
        organizationId: organization.id,
        complianceDocumentId: complianceDocument.id,
        flow:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARANCE" : "REPORTING",
        status: "ACCEPTED",
        retryable: false,
        attemptCount: 1,
        maxAttempts: 5,
        availableAt: new Date("2026-04-09T09:10:00.000Z"),
        lastAttemptAt: new Date("2026-04-09T09:10:00.000Z"),
        requestPayload: {
          invoiceNumber: invoiceTwo.invoiceNumber,
        },
        responsePayload: {
          responseCode:
            invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
        },
        createdAt: new Date("2026-04-09T09:10:00.000Z"),
        finishedAt: new Date("2026-04-09T09:15:00.000Z"),
      },
    });

    await client.zatcaSubmissionAttempt.create({
      data: {
        organizationId: organization.id,
        complianceDocumentId: complianceDocument.id,
        zatcaSubmissionId: zatcaSubmission.id,
        attemptNumber: 1,
        flow:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARANCE" : "REPORTING",
        status: "ACCEPTED",
        retryable: false,
        endpoint:
          invoiceTwo.complianceInvoiceKind === "STANDARD"
            ? "test://zatca/clearance"
            : "test://zatca/reporting",
        responsePayload: {
          responseCode:
            invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
        },
        startedAt: new Date("2026-04-09T09:10:00.000Z"),
        finishedAt: new Date("2026-04-09T09:15:00.000Z"),
      },
    });

    await client.reportedDocument.create({
      data: {
        organizationId: organization.id,
        salesInvoiceId: invoiceTwo.id,
        complianceDocumentId: complianceDocument.id,
        documentNumber: invoiceTwo.invoiceNumber,
        status:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
        submissionFlow:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARANCE" : "REPORTING",
        lastSubmissionStatus: "ACCEPTED",
        responseCode:
          invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
        responseMessage: "Seeded Week 3 reported document.",
        submittedAt: new Date("2026-04-09T09:15:00.000Z"),
      },
    });

    await client.complianceEvent.createMany({
      data: [
        {
          organizationId: organization.id,
          salesInvoiceId: invoiceTwo.id,
          complianceDocumentId: complianceDocument.id,
          complianceOnboardingId: complianceOnboarding.id,
          zatcaSubmissionId: zatcaSubmission.id,
          actorUserId: ownerUserId,
          action: "compliance.invoice.queued",
          status: "QUEUED",
          message: "Seeded invoice queued.",
        },
        {
          organizationId: organization.id,
          salesInvoiceId: invoiceTwo.id,
          complianceDocumentId: complianceDocument.id,
          complianceOnboardingId: complianceOnboarding.id,
          zatcaSubmissionId: zatcaSubmission.id,
          actorUserId: ownerUserId,
          action:
            invoiceTwo.complianceInvoiceKind === "STANDARD"
              ? "compliance.invoice.cleared"
              : "compliance.invoice.reported",
          status:
            invoiceTwo.complianceInvoiceKind === "STANDARD" ? "CLEARED" : "REPORTED",
          message:
            invoiceTwo.complianceInvoiceKind === "STANDARD"
              ? "Seeded invoice cleared."
              : "Seeded invoice reported.",
        },
      ],
    });

    await client.invoiceStatusEvent.create({
      data: {
        salesInvoiceId: invoiceTwo.id,
        actorUserId: ownerUserId,
        action:
          invoiceTwo.complianceInvoiceKind === "STANDARD"
            ? "sales.invoice.cleared_by_zatca"
            : "sales.invoice.reported_to_zatca",
        fromStatus: "PAID",
        toStatus: "PAID",
        message:
          invoiceTwo.complianceInvoiceKind === "STANDARD"
            ? "Invoice cleared through compliance core."
            : "Invoice reported through compliance core.",
      },
    });

    const billOneLines = [
      buildLine({
        description: "Venue equipment rental",
        quantity: 1,
        unitPrice: isPrimary ? 5400 : 1800,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const billOneSubtotal = billOneLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const billOneTax = billOneLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const billOneTotal = billOneSubtotal + billOneTax;
    const billOnePaid = isPrimary ? 2100 : 600;

    const billOne = await client.purchaseBill.create({
      data: {
        organizationId: organization.id,
        contactId: suppliers[0].id,
        billNumber: isPrimary ? "BILL-NE-0001" : "BILL-NL-0001",
        status: "PARTIALLY_PAID",
        issueDate: new Date("2026-04-03T09:00:00.000Z"),
        dueDate: new Date("2026-04-22T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Vendor equipment support invoice.",
        subtotal: toMoney(billOneSubtotal),
        taxTotal: toMoney(billOneTax),
        total: toMoney(billOneTotal),
        amountPaid: toMoney(billOnePaid),
        amountDue: toMoney(billOneTotal - billOnePaid),
        lines: {
          create: billOneLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    await client.billPayment.create({
      data: {
        purchaseBillId: billOne.id,
        bankAccountId: primaryBankAccount.id,
        paymentDate: new Date("2026-04-12T11:00:00.000Z"),
        amount: toMoney(billOnePaid),
        method: "Bank Transfer",
        reference: isPrimary ? "NE-BILL-PMT-001" : "NL-BILL-PMT-001",
        notes: "Partial vendor settlement.",
      },
    });

    const billTwoLines = [
      buildLine({
        description: "Printed collateral batch",
        quantity: 1,
        unitPrice: isPrimary ? 2600 : 900,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const billTwoSubtotal = billTwoLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const billTwoTax = billTwoLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const billTwoTotal = billTwoSubtotal + billTwoTax;

    const billTwo = await client.purchaseBill.create({
      data: {
        organizationId: organization.id,
        contactId: suppliers[1].id,
        billNumber: isPrimary ? "BILL-NE-0002" : "BILL-NL-0002",
        status: "PAID",
        issueDate: new Date("2026-04-07T09:00:00.000Z"),
        dueDate: new Date("2026-04-17T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Collateral and infrastructure support.",
        subtotal: toMoney(billTwoSubtotal),
        taxTotal: toMoney(billTwoTax),
        total: toMoney(billTwoTotal),
        amountPaid: toMoney(billTwoTotal),
        amountDue: "0.00",
        lines: {
          create: billTwoLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    await client.billPayment.create({
      data: {
        purchaseBillId: billTwo.id,
        bankAccountId: reserveBankAccount.id,
        paymentDate: new Date("2026-04-11T14:00:00.000Z"),
        amount: toMoney(billTwoTotal),
        method: "Bank Transfer",
        reference: isPrimary ? "NE-BILL-PMT-002" : "NL-BILL-PMT-002",
        notes: "Settled in full.",
      },
    });

    const quoteOneLines = [
      buildLine({
        description: "Launch campaign planning",
        quantity: 1,
        unitPrice: isPrimary ? 9000 : 3200,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const quoteOneSubtotal = quoteOneLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const quoteOneTax = quoteOneLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const quoteOneTotal = quoteOneSubtotal + quoteOneTax;

    const quoteOne = await client.quote.create({
      data: {
        organizationId: organization.id,
        contactId: customers[0].id,
        quoteNumber: isPrimary ? "QUO-NE-0001" : "QUO-NL-0001",
        status: "DRAFT",
        issueDate: new Date("2026-04-06T09:00:00.000Z"),
        expiryDate: new Date("2026-04-25T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Draft proposal awaiting internal review.",
        subtotal: toMoney(quoteOneSubtotal),
        taxTotal: toMoney(quoteOneTax),
        total: toMoney(quoteOneTotal),
        lines: {
          create: quoteOneLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const quoteTwoLines = [
      buildLine({
        description: "Support retainer extension",
        quantity: 1,
        unitPrice: isPrimary ? 4500 : 1500,
        taxRateId: zeroRate.id,
        taxRateName: zeroRate.name,
        taxRatePercent: Number(zeroRate.rate),
      }),
    ];
    const quoteTwoSubtotal = quoteTwoLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const quoteTwoTax = quoteTwoLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const quoteTwoTotal = quoteTwoSubtotal + quoteTwoTax;

    const quoteTwo = await client.quote.create({
      data: {
        organizationId: organization.id,
        contactId: customers[1].id,
        quoteNumber: isPrimary ? "QUO-NE-0002" : "QUO-NL-0002",
        status: "SENT",
        issueDate: new Date("2026-04-08T09:00:00.000Z"),
        expiryDate: new Date("2026-04-28T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Sent to client for approval.",
        subtotal: toMoney(quoteTwoSubtotal),
        taxTotal: toMoney(quoteTwoTax),
        total: toMoney(quoteTwoTotal),
        lines: {
          create: quoteTwoLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const salesCreditLines = [
      buildLine({
        description: "Post-campaign goodwill adjustment",
        quantity: 1,
        unitPrice: isPrimary ? 450 : 125,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const salesCreditSubtotal = salesCreditLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const salesCreditTax = salesCreditLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const salesCreditTotal = salesCreditSubtotal + salesCreditTax;

    await client.salesCreditNote.create({
      data: {
        organizationId: organization.id,
        contactId: customers[1].id,
        salesInvoiceId: invoiceTwo.id,
        creditNoteNumber: isPrimary ? "SCN-NE-0001" : "SCN-NL-0001",
        status: "APPLIED",
        issueDate: new Date("2026-04-09T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Seeded sales credit note for a pricing adjustment.",
        subtotal: toMoney(salesCreditSubtotal),
        taxTotal: toMoney(salesCreditTax),
        total: toMoney(salesCreditTotal),
        lines: {
          create: salesCreditLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const repeatingInvoiceLines = [
      buildLine({
        description: "Monthly support retainer",
        quantity: 1,
        unitPrice: isPrimary ? 3200 : 950,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const repeatingInvoiceSubtotal = repeatingInvoiceLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const repeatingInvoiceTax = repeatingInvoiceLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const repeatingInvoiceTotal =
      repeatingInvoiceSubtotal + repeatingInvoiceTax;

    await client.repeatingInvoice.create({
      data: {
        organizationId: organization.id,
        contactId: customers[0].id,
        templateName: "Monthly Retainer",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: new Date("2026-05-01T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Seeded recurring invoice schedule.",
        subtotal: toMoney(repeatingInvoiceSubtotal),
        taxTotal: toMoney(repeatingInvoiceTax),
        total: toMoney(repeatingInvoiceTotal),
        lines: {
          create: repeatingInvoiceLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const purchaseCreditLines = [
      buildLine({
        description: "Vendor rebate",
        quantity: 1,
        unitPrice: isPrimary ? 300 : 90,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const purchaseCreditSubtotal = purchaseCreditLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const purchaseCreditTax = purchaseCreditLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const purchaseCreditTotal = purchaseCreditSubtotal + purchaseCreditTax;

    await client.purchaseCreditNote.create({
      data: {
        organizationId: organization.id,
        contactId: suppliers[1].id,
        purchaseBillId: billTwo.id,
        creditNoteNumber: isPrimary ? "PCN-NE-0001" : "PCN-NL-0001",
        status: "ISSUED",
        issueDate: new Date("2026-04-12T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Seeded vendor rebate note.",
        subtotal: toMoney(purchaseCreditSubtotal),
        taxTotal: toMoney(purchaseCreditTax),
        total: toMoney(purchaseCreditTotal),
        lines: {
          create: purchaseCreditLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const purchaseOrderLines = [
      buildLine({
        description: "Production materials order",
        quantity: 1,
        unitPrice: isPrimary ? 2800 : 840,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const purchaseOrderSubtotal = purchaseOrderLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const purchaseOrderTax = purchaseOrderLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const purchaseOrderTotal = purchaseOrderSubtotal + purchaseOrderTax;

    await client.purchaseOrder.create({
      data: {
        organizationId: organization.id,
        contactId: suppliers[0].id,
        orderNumber: isPrimary ? "PO-NE-0001" : "PO-NL-0001",
        status: "SENT",
        issueDate: new Date("2026-04-10T09:00:00.000Z"),
        expectedDate: new Date("2026-04-24T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Seeded purchase order awaiting fulfillment.",
        subtotal: toMoney(purchaseOrderSubtotal),
        taxTotal: toMoney(purchaseOrderTax),
        total: toMoney(purchaseOrderTotal),
        lines: {
          create: purchaseOrderLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const repeatingBillLines = [
      buildLine({
        description: "Monthly facilities support",
        quantity: 1,
        unitPrice: isPrimary ? 1700 : 550,
        taxRateId: vatRate.id,
        taxRateName: vatRate.name,
        taxRatePercent: Number(vatRate.rate),
      }),
    ];
    const repeatingBillSubtotal = repeatingBillLines.reduce(
      (sum, line) => sum + Number(line.lineSubtotal),
      0,
    );
    const repeatingBillTax = repeatingBillLines.reduce(
      (sum, line) => sum + Number(line.lineTax),
      0,
    );
    const repeatingBillTotal = repeatingBillSubtotal + repeatingBillTax;

    await client.repeatingBill.create({
      data: {
        organizationId: organization.id,
        contactId: suppliers[0].id,
        templateName: "Monthly Facilities Support",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: new Date("2026-05-03T09:00:00.000Z"),
        currencyCode: isPrimary ? "SAR" : "USD",
        notes: "Seeded recurring bill schedule.",
        subtotal: toMoney(repeatingBillSubtotal),
        taxTotal: toMoney(repeatingBillTax),
        total: toMoney(repeatingBillTotal),
        lines: {
          create: repeatingBillLines.map((line, index) => ({
            ...line,
            sortOrder: index,
          })),
        },
      },
    });

    const stripeCustomer = await client.stripeCustomer.create({
      data: {
        organizationId: organization.id,
        stripeCustomerId: isPrimary ? "cus_NE_primary" : "cus_NL_primary",
        billingEmail: isPrimary
          ? "billing@nomad-events.example"
          : "billing@nomad-labs.example",
      },
    });

    const stripeSubscription = await client.stripeSubscription.create({
      data: {
        organizationId: organization.id,
        stripeCustomerId: stripeCustomer.id,
        stripeSubscriptionId: isPrimary ? "sub_NE_growth" : "sub_NL_starter",
        planCode: isPrimary ? "GROWTH" : "STARTER",
        status: "ACTIVE",
        seats: isPrimary ? 12 : 4,
        currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-04-30T23:59:59.000Z"),
        cancelAtPeriodEnd: false,
      },
    });

    await client.billingInvoice.createMany({
      data: [
        {
          organizationId: organization.id,
          stripeSubscriptionId: stripeSubscription.id,
          stripeInvoiceId: isPrimary ? "in_NE_0001" : "in_NL_0001",
          invoiceNumber: isPrimary ? "SUB-NE-0001" : "SUB-NL-0001",
          status: "paid",
          total: isPrimary ? "299.00" : "79.00",
          currencyCode: "USD",
          issuedAt: new Date("2026-04-01T00:00:00.000Z"),
          dueAt: new Date("2026-04-05T00:00:00.000Z"),
          paidAt: new Date("2026-04-02T10:00:00.000Z"),
          hostedInvoiceUrl: "https://billing.daftar.local/invoice/paid",
        },
        {
          organizationId: organization.id,
          stripeSubscriptionId: stripeSubscription.id,
          stripeInvoiceId: isPrimary ? "in_NE_0002" : "in_NL_0002",
          invoiceNumber: isPrimary ? "SUB-NE-0002" : "SUB-NL-0002",
          status: "open",
          total: isPrimary ? "299.00" : "79.00",
          currencyCode: "USD",
          issuedAt: new Date("2026-05-01T00:00:00.000Z"),
          dueAt: new Date("2026-05-05T00:00:00.000Z"),
          paidAt: null,
          hostedInvoiceUrl: "https://billing.daftar.local/invoice/open",
        },
      ],
    });

    const asset = await client.fixedAsset.create({
      data: {
        organizationId: organization.id,
        assetNumber: isPrimary ? "FA-NE-0001" : "FA-NL-0001",
        name: isPrimary ? "Event Equipment Rack" : "Studio Editing Workstation",
        category: isPrimary ? "Production Equipment" : "Computer Equipment",
        purchaseDate: new Date("2025-12-15T00:00:00.000Z"),
        cost: isPrimary ? "18000.00" : "5400.00",
        salvageValue: isPrimary ? "2000.00" : "400.00",
        usefulLifeMonths: 36,
        depreciationMethod: "STRAIGHT_LINE",
        accumulatedDepreciation: isPrimary ? "1777.78" : "533.33",
        netBookValue: isPrimary ? "16222.22" : "4866.67",
        status: "ACTIVE",
        lastDepreciatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    });

    await client.depreciationRun.create({
      data: {
        organizationId: organization.id,
        fixedAssetId: asset.id,
        runDate: new Date("2026-04-01T00:00:00.000Z"),
        depreciationAmount: isPrimary ? "444.44" : "133.33",
        accumulatedDepreciation: isPrimary ? "1777.78" : "533.33",
        netBookValue: isPrimary ? "16222.22" : "4866.67",
      },
    });

    await client.storedFile.createMany({
      data: [
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/sales/${invoiceOne.id}/scope.pdf`,
          originalFileName: "invoice-scope.pdf",
          mimeType: "application/pdf",
          sizeBytes: 32011,
          checksumSha256: `${organization.slug}-invoice-one-sha`,
          relatedType: "sales-invoice",
          relatedId: invoiceOne.id,
          metadata: { label: "Invoice scope attachment" },
        },
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/purchases/${billOne.id}/vendor.pdf`,
          originalFileName: "vendor-bill.pdf",
          mimeType: "application/pdf",
          sizeBytes: 18221,
          checksumSha256: `${organization.slug}-bill-one-sha`,
          relatedType: "purchase-bill",
          relatedId: billOne.id,
          metadata: { label: "Supplier bill attachment" },
        },
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/quotes/${quoteOne.id}/proposal.pdf`,
          originalFileName: "quote-proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 24555,
          checksumSha256: `${organization.slug}-quote-one-sha`,
          relatedType: "quote",
          relatedId: quoteOne.id,
          metadata: { label: "Quote proposal attachment" },
        },
        {
          organizationId: organization.id,
          uploadedByUserId: ownerUserId,
          storageProvider: "S3_COMPAT",
          bucket: env.S3_BUCKET,
          objectKey: `${organization.slug}/quotes/${quoteTwo.id}/client-copy.pdf`,
          originalFileName: "quote-client-copy.pdf",
          mimeType: "application/pdf",
          sizeBytes: 21440,
          checksumSha256: `${organization.slug}-quote-two-sha`,
          relatedType: "quote",
          relatedId: quoteTwo.id,
          metadata: { label: "Quote proposal attachment" },
        },
      ],
    });
    await writeSeedStoredFiles([
      {
        objectKey: `${organization.slug}/sales/${invoiceOne.id}/scope.pdf`,
        contents: `Invoice scope attachment for ${invoiceOne.invoiceNumber}`,
        sizeBytes: 32011,
      },
      {
        objectKey: `${organization.slug}/purchases/${billOne.id}/vendor.pdf`,
        contents: `Vendor bill attachment for ${billOne.billNumber}`,
        sizeBytes: 18221,
      },
      {
        objectKey: `${organization.slug}/quotes/${quoteOne.id}/proposal.pdf`,
        contents: `Quote proposal attachment for ${quoteOne.quoteNumber}`,
        sizeBytes: 24555,
      },
      {
        objectKey: `${organization.slug}/quotes/${quoteTwo.id}/client-copy.pdf`,
        contents: `Quote client copy attachment for ${quoteTwo.quoteNumber}`,
        sizeBytes: 21440,
      },
    ]);

    const contactsForBalances = [...customers, ...suppliers];
    for (const contact of contactsForBalances) {
      const [salesBalances, billBalances] = await Promise.all([
        client.salesInvoice.aggregate({
          where: {
            organizationId: organization.id,
            contactId: contact.id,
            status: { not: "VOID" },
          },
          _sum: { amountDue: true },
        }),
        client.purchaseBill.aggregate({
          where: {
            organizationId: organization.id,
            contactId: contact.id,
            status: { not: "VOID" },
          },
          _sum: { amountDue: true },
        }),
      ]);

      await client.contact.update({
        where: { id: contact.id },
        data: {
          receivableBalance: toMoney(Number(salesBalances._sum.amountDue ?? 0)),
          payableBalance: toMoney(Number(billBalances._sum.amountDue ?? 0)),
        },
      });
    }
  }

  await client.auditLog.createMany({
    data: [
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.roles.created",
        targetType: "role",
        result: "SUCCESS",
        metadata: { count: roles.length },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "USER",
        actorUserId: ownerUserId,
        action: "seed.owner.ready",
        targetType: "user",
        targetId: ownerUserId,
        result: "INFO",
        metadata: { email: "owner@daftar.local" },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.week2.setup.ready",
        targetType: "organization",
        targetId: organizationBySlug["nomad-events"].id,
        result: "SUCCESS",
        metadata: {
          contacts: 4,
          connectorProviders: ["XERO", "QUICKBOOKS_ONLINE", "ZOHO_BOOKS"],
        },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.week3.accounting.ready",
        targetType: "organization",
        targetId: organizationBySlug["nomad-events"].id,
        result: "SUCCESS",
        metadata: {
          invoices: 2,
          bills: 2,
          quotes: 2,
          reportedDocuments: 1,
        },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.week4.extensions.ready",
        targetType: "organization",
        targetId: organizationBySlug["nomad-events"].id,
        result: "SUCCESS",
        metadata: {
          salesCreditNotes: 1,
          purchaseCreditNotes: 1,
          purchaseOrders: 1,
          repeatingInvoices: 1,
          repeatingBills: 1,
          fixedAssets: 1,
          billingInvoices: 2,
        },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.week8.inventory.ready",
        targetType: "organization",
        targetId: organizationBySlug["nomad-events"].id,
        result: "SUCCESS",
        metadata: {
          inventoryItems: 2,
          stockMovements: 4,
        },
      },
      {
        organizationId: organizationBySlug["nomad-events"].id,
        actorType: "SYSTEM",
        action: "seed.week7.manual_journals.ready",
        targetType: "organization",
        targetId: organizationBySlug["nomad-events"].id,
        result: "SUCCESS",
        metadata: {
          journalEntries: 2,
        },
      },
    ],
  });
}

async function main() {
  await seedDatabase(prisma);
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl === import.meta.url) {
  main()
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
