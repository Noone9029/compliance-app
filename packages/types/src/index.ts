export const roleKeys = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "COMPLIANCE_OFFICER",
  "VIEWER",
] as const;

export type RoleKey = (typeof roleKeys)[number];

export const permissionKeys = [
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
  "shell.hr_payroll.read",
  "shell.subscription.read",
  "shell.task_management.read",
  "shell.applications.read",
  "shell.list_tracking.read",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const accountTypes = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

export type AccountType = (typeof accountTypes)[number];

export const taxRateScopes = ["SALES", "PURCHASE", "BOTH"] as const;

export type TaxRateScope = (typeof taxRateScopes)[number];

export const addressTypes = ["BILLING", "DELIVERY", "PRIMARY"] as const;

export type AddressType = (typeof addressTypes)[number];

export const connectorProviders = [
  "XERO",
  "QUICKBOOKS_ONLINE",
  "ZOHO_BOOKS",
] as const;

export type ConnectorProvider = (typeof connectorProviders)[number];

export const connectorAccountStatuses = [
  "PENDING",
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
] as const;

export type ConnectorAccountStatus = (typeof connectorAccountStatuses)[number];

export const connectorSyncDirections = ["IMPORT", "EXPORT"] as const;

export type ConnectorSyncDirection = (typeof connectorSyncDirections)[number];

export const connectorSyncStatuses = ["PENDING", "SUCCESS", "FAILED"] as const;

export type ConnectorSyncStatus = (typeof connectorSyncStatuses)[number];

export const fileStorageProviders = ["S3_COMPAT"] as const;

export type FileStorageProvider = (typeof fileStorageProviders)[number];

export const salesInvoiceStatuses = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "REPORTED",
  "VOID",
] as const;

export type SalesInvoiceStatus = (typeof salesInvoiceStatuses)[number];

export const purchaseBillStatuses = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
] as const;

export type PurchaseBillStatus = (typeof purchaseBillStatuses)[number];

export const quoteStatuses = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "DECLINED",
  "CONVERTED",
] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];

export const complianceInvoiceKinds = ["STANDARD", "SIMPLIFIED"] as const;

export type ComplianceInvoiceKind = (typeof complianceInvoiceKinds)[number];

export const complianceDocumentStatuses = [
  "DRAFT",
  "READY",
  "QUEUED",
  "PROCESSING",
  "RETRY_SCHEDULED",
  "CLEARED",
  "CLEARED_WITH_WARNINGS",
  "REPORTED",
  "REPORTED_WITH_WARNINGS",
  "REJECTED",
  "FAILED",
] as const;

export type ComplianceDocumentStatus =
  (typeof complianceDocumentStatuses)[number];

export const submissionStatuses = [
  "QUEUED",
  "PROCESSING",
  "ACCEPTED",
  "ACCEPTED_WITH_WARNINGS",
  "RETRY_SCHEDULED",
  "REJECTED",
  "FAILED",
] as const;

export type SubmissionStatus = (typeof submissionStatuses)[number];

export const complianceSubmissionFlows = ["CLEARANCE", "REPORTING"] as const;

export type ComplianceSubmissionFlow =
  (typeof complianceSubmissionFlows)[number];

export const complianceOnboardingStatuses = [
  "DRAFT",
  "CSR_GENERATED",
  "OTP_PENDING",
  "CSR_SUBMITTED",
  "CERTIFICATE_ISSUED",
  "ACTIVE",
  "RENEWAL_REQUIRED",
  "EXPIRED",
  "REVOKED",
  "FAILED",
  "NOT_STARTED",
  "PENDING_CONFIGURATION",
  "ERROR",
] as const;

export type ComplianceOnboardingStatus =
  (typeof complianceOnboardingStatuses)[number];

export const complianceCertificateStatuses = [
  "NOT_REQUESTED",
  "CSR_GENERATED",
  "OTP_PENDING",
  "CSR_SUBMITTED",
  "CERTIFICATE_ISSUED",
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "FAILED",
  "ERROR",
] as const;

export type ComplianceCertificateStatus =
  (typeof complianceCertificateStatuses)[number];

export const complianceFailureCategories = [
  "CONFIGURATION",
  "AUTHENTICATION",
  "CONNECTIVITY",
  "VALIDATION",
  "ZATCA_REJECTION",
  "TERMINAL",
  "UNKNOWN",
] as const;

export type ComplianceFailureCategory =
  (typeof complianceFailureCategories)[number];

export const creditNoteStatuses = ["DRAFT", "ISSUED", "APPLIED"] as const;

export type CreditNoteStatus = (typeof creditNoteStatuses)[number];

export const recurringScheduleStatuses = ["ACTIVE", "PAUSED"] as const;

export type RecurringScheduleStatus =
  (typeof recurringScheduleStatuses)[number];

export const purchaseOrderStatuses = [
  "DRAFT",
  "SENT",
  "RECEIVED",
  "CLOSED",
] as const;

export type PurchaseOrderStatus = (typeof purchaseOrderStatuses)[number];

export const billingPlanCodes = ["STARTER", "GROWTH", "SCALE"] as const;

export type BillingPlanCode = (typeof billingPlanCodes)[number];

export const billingSubscriptionStatuses = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
] as const;

export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatuses)[number];

export const fixedAssetStatuses = [
  "ACTIVE",
  "FULLY_DEPRECIATED",
  "DISPOSED",
] as const;

export type FixedAssetStatus = (typeof fixedAssetStatuses)[number];

export const inventoryMovementTypes = [
  "OPENING",
  "IMPORT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "PURCHASE_BILL",
  "SALES_INVOICE",
] as const;

export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

export type SessionSnapshot = {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership: {
    id: string;
    roleKey: RoleKey;
    status: string;
  } | null;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

export type MembershipSummary = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleKey: RoleKey;
  status: string;
};

export type CapabilitySnapshot = {
  roleKey: RoleKey | null;
  permissions: PermissionKey[];
};

export type InvitationPreviewRecord = {
  email: string;
  fullName: string;
  organizationName: string;
  organizationSlug: string;
  roleKey: RoleKey;
  expiresAt: string;
  status: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";
};

export type PasswordResetRequestRecord = {
  ok: true;
};

export type TeamMemberRecord = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  roleKey: RoleKey;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  createdAt: string;
  updatedAt: string;
  isCurrentUser: boolean;
  isLastActiveOwner: boolean;
};

export type TeamInvitationStatus =
  | "PENDING"
  | "EXPIRED"
  | "ACCEPTED"
  | "REVOKED";

export type TeamInvitationRecord = {
  id: string;
  membershipId: string;
  email: string;
  fullName: string | null;
  roleKey: RoleKey;
  status: TeamInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInvitationInput = {
  email: string;
  fullName?: string | null;
  roleKey: RoleKey;
};

export type UpdateMembershipRoleInput = {
  roleKey: RoleKey;
};

export type AuditEventRecord = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  organizationId: string | null;
  actorUserId: string | null;
  createdAt: string;
};

export type AuditReportRecord = {
  id: string;
  organizationId: string | null;
  actorType: "USER" | "SYSTEM";
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: "SUCCESS" | "FAILURE" | "INFO";
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditReportMetricsRecord = {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  userEvents: number;
  systemEvents: number;
};

export type AuditReportResponse = {
  metrics: AuditReportMetricsRecord;
  events: AuditReportRecord[];
};

export type CurrencyRecord = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: string;
  isBase: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaxRateRecord = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  rate: string;
  scope: TaxRateScope;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationTaxDetailRecord = {
  id: string;
  organizationId: string;
  legalName: string;
  taxNumber: string;
  countryCode: string;
  taxOffice: string | null;
  registrationNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrackingOptionRecord = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
};

export type TrackingCategoryRecord = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  options: TrackingOptionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type BankAccountRecord = {
  id: string;
  organizationId: string;
  name: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  iban: string | null;
  currencyCode: string;
  openingBalance: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountRecord = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateRecord = {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceSettingsRecord = {
  invoicePrefix: string;
  defaultDueDays: number;
  footerNote: string;
  whatsappEnabled: boolean;
};

export type CustomOrganizationSettingsRecord = {
  defaultLanguage: string;
  timezone: string;
  fiscalYearStartMonth: number;
  notes: string;
};

export type ContactGroupRecord = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AddressRecord = {
  id: string;
  type: AddressType;
  line1: string;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string;
};

export type ContactNumberRecord = {
  id: string;
  label: string;
  phoneNumber: string;
};

export type StoredFileRecord = {
  id: string;
  organizationId: string;
  storageProvider: FileStorageProvider;
  bucket: string;
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  relatedType: string | null;
  relatedId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ContactSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  taxNumber: string | null;
  customerCode: string | null;
  supplierCode: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  currencyCode: string | null;
  paymentTermsDays: number | null;
  receivableBalance: string;
  payableBalance: string;
  groupNames: string[];
  createdAt: string;
  updatedAt: string;
};

export type ContactDetail = ContactSummary & {
  notes: string | null;
  addresses: AddressRecord[];
  numbers: ContactNumberRecord[];
  groups: ContactGroupRecord[];
  files: StoredFileRecord[];
};

export type ConnectorAccountRecord = {
  id: string;
  organizationId: string;
  provider: ConnectorProvider;
  displayName: string;
  status: ConnectorAccountStatus;
  externalTenantId: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorSyncLogRecord = {
  id: string;
  organizationId: string;
  connectorAccountId: string;
  direction: ConnectorSyncDirection;
  scope: string;
  status: ConnectorSyncStatus;
  retryable: boolean;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
};

export type ConnectorSyncPreviewRecord = {
  connectorAccountId: string;
  provider: ConnectorProvider;
  direction: ConnectorSyncDirection;
  scopes: { scope: string; recordCount: number }[];
  generatedAt: string;
};

export type DocumentLineRecord = {
  id: string;
  description: string;
  inventoryItemId: string | null;
  inventoryItemCode: string | null;
  inventoryItemName: string | null;
  quantity: string;
  unitPrice: string;
  taxRateId: string | null;
  taxRateName: string | null;
  taxRatePercent: string;
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  sortOrder: number;
};

export type DocumentPaymentRecord = {
  id: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  paymentDate: string;
  amount: string;
  method: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

export type InvoiceStatusEventRecord = {
  id: string;
  action: string;
  fromStatus: SalesInvoiceStatus | null;
  toStatus: SalesInvoiceStatus | null;
  message: string | null;
  actorUserId: string | null;
  createdAt: string;
};

export type ComplianceDocumentRecord = {
  id: string;
  salesInvoiceId: string;
  invoiceKind: ComplianceInvoiceKind;
  submissionFlow: ComplianceSubmissionFlow;
  invoiceCounter: number;
  uuid: string;
  qrPayload: string;
  previousHash: string | null;
  currentHash: string;
  xmlAvailable: boolean;
  status: ComplianceDocumentStatus;
  lastSubmissionStatus: SubmissionStatus | null;
  lastSubmittedAt: string | null;
  lastError: string | null;
  failureCategory: ComplianceFailureCategory | null;
  externalSubmissionId: string | null;
  clearedAt: string | null;
  reportedAt: string | null;
  localValidation: {
    status: "PASSED" | "FAILED" | "SKIPPED";
    warnings: string[];
    errors: string[];
  } | null;
  localValidationMetadata: Record<string, unknown> | null;
  hashMetadata: Record<string, unknown> | null;
  qrMetadata: Record<string, unknown> | null;
  signatureMetadata: Record<string, unknown> | null;
  retryAllowed: boolean;
  canShareWithCustomer: boolean;
  submission: ComplianceSubmissionRecord | null;
  attempts: ComplianceSubmissionAttemptRecord[];
  timeline: ComplianceTimelineRecord[];
  createdAt: string;
  updatedAt: string;
};

export type ComplianceMonitorInvoiceRecord = {
  salesInvoiceId: string;
  invoiceNumber: string;
  invoiceStatus: SalesInvoiceStatus;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  total: string;
  compliance: ComplianceDocumentRecord;
};

export type ReportedDocumentRecord = {
  id: string;
  organizationId: string;
  salesInvoiceId: string;
  complianceDocumentId: string;
  documentNumber: string;
  status: string;
  submissionFlow: ComplianceSubmissionFlow;
  lastSubmissionStatus: SubmissionStatus | null;
  failureCategory: ComplianceFailureCategory | null;
  externalSubmissionId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  submittedAt: string;
  createdAt: string;
};

export type ComplianceSubmissionRecord = {
  id: string;
  complianceDocumentId: string;
  flow: ComplianceSubmissionFlow;
  status: SubmissionStatus;
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  finishedAt: string | null;
  failureCategory: ComplianceFailureCategory | null;
  externalSubmissionId: string | null;
  errorMessage: string | null;
  requestId: string | null;
  warnings: string[];
  errors: string[];
  createdAt: string;
  updatedAt: string;
};

export type ComplianceSubmissionAttemptRecord = {
  id: string;
  complianceDocumentId: string;
  submissionId: string;
  attemptNumber: number;
  flow: ComplianceSubmissionFlow;
  status: SubmissionStatus;
  retryable: boolean;
  endpoint: string;
  httpStatus: number | null;
  failureCategory: ComplianceFailureCategory | null;
  externalSubmissionId: string | null;
  errorMessage: string | null;
  requestId: string | null;
  warnings: string[];
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
};

export type ComplianceTimelineRecord = {
  id: string;
  action: string;
  status: string;
  message: string | null;
  createdAt: string;
};

export const complianceDeadLetterStates = [
  "OPEN",
  "ACKNOWLEDGED",
  "ESCALATED",
  "REQUEUED",
] as const;

export type ComplianceDeadLetterState =
  (typeof complianceDeadLetterStates)[number];

export type ComplianceDeadLetterRecord = {
  submissionId: string;
  complianceDocumentId: string;
  salesInvoiceId: string;
  invoiceNumber: string;
  submissionFlow: ComplianceSubmissionFlow;
  submissionStatus: SubmissionStatus;
  state: ComplianceDeadLetterState;
  failureCategory: ComplianceFailureCategory | null;
  lastError: string | null;
  reason: string;
  failedAt: string;
  attemptCount: number;
  maxAttempts: number;
  wasRetryable: boolean;
  canRequeue: boolean;
  acknowledgedAt: string | null;
  escalatedAt: string | null;
  requeuedAt: string | null;
  requestId: string | null;
  externalSubmissionId: string | null;
  updatedAt: string;
};

export type ComplianceDeadLetterDetailRecord = ComplianceDeadLetterRecord & {
  compliance: ComplianceDocumentRecord;
  timeline: ComplianceTimelineRecord[];
};

export type SalesInvoiceSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  invoiceNumber: string;
  status: SalesInvoiceStatus;
  complianceInvoiceKind: ComplianceInvoiceKind;
  complianceStatus: ComplianceDocumentStatus | null;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesInvoiceDetail = SalesInvoiceSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
  payments: DocumentPaymentRecord[];
  attachments: StoredFileRecord[];
  statusEvents: InvoiceStatusEventRecord[];
  compliance: ComplianceDocumentRecord | null;
};

export type SalesCreditNoteSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  salesInvoiceId: string | null;
  creditNoteNumber: string;
  status: CreditNoteStatus;
  issueDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesCreditNoteDetail = SalesCreditNoteSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
};

export type RepeatingInvoiceRecord = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  templateName: string;
  status: RecurringScheduleStatus;
  frequencyLabel: string;
  intervalCount: number;
  nextRunAt: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  lines: DocumentLineRecord[];
  createdAt: string;
  updatedAt: string;
};

export type PurchaseBillSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  billNumber: string;
  status: PurchaseBillStatus;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseBillDetail = PurchaseBillSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
  payments: DocumentPaymentRecord[];
  attachments: StoredFileRecord[];
};

export type PurchaseCreditNoteSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  purchaseBillId: string | null;
  creditNoteNumber: string;
  status: CreditNoteStatus;
  issueDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseCreditNoteDetail = PurchaseCreditNoteSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
};

export type PurchaseOrderSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  issueDate: string;
  expectedDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderDetail = PurchaseOrderSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
};

export type RepeatingBillRecord = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  templateName: string;
  status: RecurringScheduleStatus;
  frequencyLabel: string;
  intervalCount: number;
  nextRunAt: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  lines: DocumentLineRecord[];
  createdAt: string;
  updatedAt: string;
};

export type QuoteSummary = {
  id: string;
  organizationId: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  quoteNumber: string;
  status: QuoteStatus;
  expiryDate: string;
  issueDate: string;
  currencyCode: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  convertedInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteDetail = QuoteSummary & {
  notes: string | null;
  lines: DocumentLineRecord[];
  attachments: StoredFileRecord[];
};

export type BillingSummaryRecord = {
  stripeCustomerId: string | null;
  billingEmail: string | null;
  subscriptionId: string | null;
  planCode: BillingPlanCode | null;
  status: BillingSubscriptionStatus | null;
  seats: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingPlanRecord = {
  code: BillingPlanCode;
  name: string;
  description: string;
  monthlyPrice: string;
  currencyCode: string;
  includedSeats: number;
  addOns: string[];
};

export type BillingInvoiceRecord = {
  id: string;
  organizationId: string;
  stripeSubscriptionId: string | null;
  stripeInvoiceId: string;
  invoiceNumber: string;
  status: string;
  total: string;
  currencyCode: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
};

export type FixedAssetRecord = {
  id: string;
  organizationId: string;
  assetNumber: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: string;
  netBookValue: string;
  status: FixedAssetStatus;
  lastDepreciatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepreciationRunRecord = {
  id: string;
  organizationId: string;
  fixedAssetId: string;
  runDate: string;
  depreciationAmount: string;
  accumulatedDepreciation: string;
  netBookValue: string;
  createdAt: string;
};

export type InventoryItemSummary = {
  id: string;
  organizationId: string;
  itemCode: string;
  itemName: string;
  description: string | null;
  costPrice: string;
  salePrice: string;
  quantityOnHand: string;
  createdAt: string;
  updatedAt: string;
};

export type StockMovementRecord = {
  id: string;
  organizationId: string;
  inventoryItemId: string;
  movementType: InventoryMovementType;
  quantityDelta: string;
  quantityAfter: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

export type InventoryItemDetail = InventoryItemSummary & {
  movements: StockMovementRecord[];
};

export type InventoryImportResult = {
  fileId: string;
  originalFileName: string;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
};

export type ManualJournalLineRecord = {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  description: string | null;
  debit: string;
  credit: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ManualJournalSummary = {
  id: string;
  organizationId: string;
  journalNumber: string;
  reference: string | null;
  entryDate: string;
  memo: string | null;
  totalDebit: string;
  totalCredit: string;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ManualJournalDetail = ManualJournalSummary & {
  lines: ManualJournalLineRecord[];
};

export type BudgetSummaryRecord = {
  projectedMonthlyRevenue: string;
  projectedMonthlyExpenses: string;
  projectedMonthlyNet: string;
  activeRepeatingInvoices: number;
  activeRepeatingBills: number;
};

export type ExpenseBreakdownRecord = {
  billsExpense: string;
  journalExpense: string;
  depreciationExpense: string;
  totalExpenses: string;
  categories: ChartPointRecord[];
};

export type BalanceSheetRecord = {
  assets: string;
  liabilities: string;
  equity: string;
};

export type TrialBalanceLineRecord = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: string;
  credit: string;
};

export type TrialBalanceRecord = {
  lines: TrialBalanceLineRecord[];
  totalDebit: string;
  totalCredit: string;
};

export type ComplianceOverviewRecord = {
  totalInvoicesReady: number;
  totalReportedDocuments: number;
  queuedSubmissions: number;
  processingSubmissions: number;
  retryScheduledSubmissions: number;
  failedSubmissions: number;
  recentReportedDocuments: ReportedDocumentRecord[];
};

export type EInvoicePaymentMeansOptionRecord = {
  code: string;
  label: string;
};

export type EInvoicePaymentMeansMappingRecord = {
  bankAccountId: string;
  accountName: string;
  paymentMeansCode: string | null;
  paymentMeansLabel: string | null;
};

export type EInvoiceIntegrationRecord = {
  organizationName: string;
  legalName: string | null;
  taxNumber: string | null;
  registrationNumber: string | null;
  environment: "Production" | "Sandbox";
  integrationDate: string | null;
  status: "REGISTERED" | "NOT_REGISTERED";
  onboarding: ComplianceOnboardingRecord | null;
  timeline: ComplianceTimelineRecord[];
  mappings: EInvoicePaymentMeansMappingRecord[];
  availablePaymentMeans: EInvoicePaymentMeansOptionRecord[];
};

export type ComplianceOnboardingRecord = {
  id: string;
  environment: "Production" | "Sandbox";
  deviceName: string;
  deviceSerial: string;
  status: ComplianceOnboardingStatus;
  certificateStatus: ComplianceCertificateStatus;
  commonName: string | null;
  egsSerialNumber: string | null;
  organizationUnitName: string | null;
  organizationName: string | null;
  countryCode: string | null;
  vatNumber: string | null;
  branchName: string | null;
  locationAddress: string | null;
  industry: string | null;
  hasCsr: boolean;
  hasCertificate: boolean;
  csrGeneratedAt: string | null;
  otpReceivedAt: string | null;
  csrSubmittedAt: string | null;
  csid: string | null;
  certificateId: string | null;
  secretFingerprint: string | null;
  certificateIssuedAt: string | null;
  certificateExpiresAt: string | null;
  lastActivatedAt: string | null;
  lastRenewedAt: string | null;
  revokedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveSummaryRecord = {
  totalSales: string;
  totalPurchases: string;
  receivables: string;
  payables: string;
  reportedDocumentsCount: number;
  draftQuotesCount: number;
};

export type SalesTaxReportRecord = {
  taxableSales: string;
  taxCollected: string;
  invoiceCount: number;
  lines: SalesTaxLineRecord[];
};

export type PayablesReceivablesRecord = {
  totalReceivables: string;
  totalPayables: string;
  overdueReceivables: string;
  unpaidBills: string;
  documents: OutstandingDocumentRecord[];
};

export type ProfitLossRecord = {
  revenue: string;
  expenses: string;
  profit: string;
};

export type ContactTransactionRecord = {
  contactId: string;
  contactName: string;
  receivableBalance: string;
  payableBalance: string;
  salesCount: number;
  billCount: number;
};

export type BankSummaryRecord = {
  totalOpeningBalance: string;
  totalInflow: string;
  totalOutflow: string;
  totalClosingBalance: string;
  accountCount: number;
  unassignedIncoming: string;
  unassignedOutgoing: string;
  accounts: BankSummaryLineRecord[];
};

export type BankSummaryLineRecord = {
  bankAccountId: string;
  accountName: string;
  currencyCode: string;
  isPrimary: boolean;
  openingBalance: string;
  cashReceived: string;
  cashSpent: string;
  closingBalance: string;
};

export type SalesTaxLineRecord = {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  issueDate: string;
  dueDate: string;
  status: SalesInvoiceStatus;
  currencyCode: string;
  taxableSales: string;
  taxCollected: string;
  taxRateLabel: string;
  taxComponentLabel: string;
  accountTypeLabel: string;
};

export type OutstandingDocumentRecord = {
  kind: "RECEIVABLE" | "PAYABLE";
  documentId: string;
  documentNumber: string;
  contactId: string;
  contactName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  currencyCode: string;
  amountDue: string;
  isOverdue: boolean;
};

export type SalesPurchasesSeriesPoint = {
  label: string;
  salesTotal: string;
  purchasesTotal: string;
  quotesTotal: string;
};

export type ReportsDashboardRecord = {
  executiveSummary: ExecutiveSummaryRecord;
  salesTax: SalesTaxReportRecord;
  payablesReceivables: PayablesReceivablesRecord;
  profitLoss: ProfitLossRecord;
  bankSummary: BankSummaryRecord;
  budgetSummary: BudgetSummaryRecord;
  expenseBreakdown: ExpenseBreakdownRecord;
  balanceSheet: BalanceSheetRecord;
  trialBalance: TrialBalanceRecord;
  salesPurchasesSeries: SalesPurchasesSeriesPoint[];
  contactTransactions: ContactTransactionRecord[];
  reportedDocuments: ReportedDocumentRecord[];
};

export type ChartPointRecord = {
  label: string;
  value: string;
};

export type SalesPurchasesChartPoint = {
  label: string;
  sales: string;
  purchases: string;
};

export type ChartsDashboardRecord = {
  bankBalances: ChartPointRecord[];
  balanceChart: ChartPointRecord[];
  profitLoss: ChartPointRecord[];
  expenses: ChartPointRecord[];
  receivablesPayables: ChartPointRecord[];
  salesPurchases: SalesPurchasesChartPoint[];
};

export type ProfitLossSeriesRecord = {
  label: string;
  revenue: string;
  expenses: string;
  grossProfit: string;
  netProfit: string;
};

export type CashFlowPointRecord = {
  label: string;
  cashIn: string;
  cashOut: string;
  cashRemaining: string;
};

export type SalesPurchaseBalanceRecord = {
  label: "Receivables" | "Payables";
  total: string;
  due: string;
};

export type AccountingDashboardRecord = {
  organizationName: string;
  bankBalances: ChartPointRecord[];
  profitLossSeries: ProfitLossSeriesRecord[];
  balanceSheet: ChartPointRecord[];
  expenseBreakdown: ChartPointRecord[];
  cashFlow: CashFlowPointRecord[];
  salesPurchases: SalesPurchaseBalanceRecord[];
};

export type OrganizationStatsRecord = {
  organizationName: string;
  selectedYear: number;
  selectedMonth: number;
  availableYears: number[];
  usersByRole: ChartPointRecord[];
  membershipStatus: ChartPointRecord[];
  totalUsers: number;
  activeUsers: number;
  invitedUsers: number;
  disabledUsers: number;
  joinedThisPeriod: number;
  activeUsersThisPeriod: number;
};
