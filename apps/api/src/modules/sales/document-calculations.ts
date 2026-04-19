export type DraftDocumentLine = {
  description?: string | null;
  inventoryItemId?: string | null;
  inventoryItemCode?: string | null;
  inventoryItemName?: string | null;
  quantity: number | string;
  unitPrice: number | string;
  taxRateId?: string | null;
  taxRateName?: string | null;
  taxRatePercent?: number | string | null;
};

export type CalculatedDocumentLine = {
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

export type PersistedDocumentLine = Omit<
  CalculatedDocumentLine,
  "inventoryItemCode" | "inventoryItemName"
>;

export type PersistedDocumentLineWithoutInventory = Omit<
  PersistedDocumentLine,
  "inventoryItemId"
>;

function asNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function toMoney(value: number) {
  return value.toFixed(2);
}

export function calculateDocumentLines(lines: DraftDocumentLine[]) {
  const calculatedLines: CalculatedDocumentLine[] = lines.map((line, index) => {
    const quantity = asNumber(line.quantity);
    const unitPrice = asNumber(line.unitPrice);
    const taxRatePercent = asNumber(line.taxRatePercent);
    const lineSubtotal = quantity * unitPrice;
    const lineTax = (lineSubtotal * taxRatePercent) / 100;
    const lineTotal = lineSubtotal + lineTax;

    return {
      description: line.description ?? "",
      inventoryItemId: line.inventoryItemId ?? null,
      inventoryItemCode: line.inventoryItemCode ?? null,
      inventoryItemName: line.inventoryItemName ?? null,
      quantity: toMoney(quantity),
      unitPrice: toMoney(unitPrice),
      taxRateId: line.taxRateId ?? null,
      taxRateName: line.taxRateName ?? null,
      taxRatePercent: toMoney(taxRatePercent),
      lineSubtotal: toMoney(lineSubtotal),
      lineTax: toMoney(lineTax),
      lineTotal: toMoney(lineTotal),
      sortOrder: index
    };
  });

  const subtotal = calculatedLines.reduce(
    (sum, line) => sum + asNumber(line.lineSubtotal),
    0
  );
  const taxTotal = calculatedLines.reduce((sum, line) => sum + asNumber(line.lineTax), 0);
  const total = subtotal + taxTotal;

  return {
    lines: calculatedLines,
    subtotal: toMoney(subtotal),
    taxTotal: toMoney(taxTotal),
    total: toMoney(total)
  };
}

export function toPersistedDocumentLines(lines: CalculatedDocumentLine[]): PersistedDocumentLine[] {
  return lines.map((line) => ({
    description: line.description,
    inventoryItemId: line.inventoryItemId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRateId: line.taxRateId,
    taxRateName: line.taxRateName,
    taxRatePercent: line.taxRatePercent,
    lineSubtotal: line.lineSubtotal,
    lineTax: line.lineTax,
    lineTotal: line.lineTotal,
    sortOrder: line.sortOrder
  }));
}

export function toPersistedDocumentLinesWithoutInventory(
  lines: CalculatedDocumentLine[]
): PersistedDocumentLineWithoutInventory[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRateId: line.taxRateId,
    taxRateName: line.taxRateName,
    taxRatePercent: line.taxRatePercent,
    lineSubtotal: line.lineSubtotal,
    lineTax: line.lineTax,
    lineTotal: line.lineTotal,
    sortOrder: line.sortOrder
  }));
}

export function determineInvoiceStatus(input: {
  currentStatus?: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "REPORTED" | "VOID";
  amountPaid: number | string;
  amountDue: number | string;
}) {
  if (input.currentStatus === "VOID") {
    return "VOID" as const;
  }

  if (asNumber(input.amountDue) <= 0) {
    return "PAID" as const;
  }

  if (asNumber(input.amountPaid) > 0) {
    return "PARTIALLY_PAID" as const;
  }

  return input.currentStatus === "DRAFT" ? "DRAFT" : "ISSUED";
}

export function determineBillStatus(input: {
  currentStatus?: "DRAFT" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "VOID";
  amountPaid: number | string;
  amountDue: number | string;
}) {
  if (input.currentStatus === "VOID") {
    return "VOID" as const;
  }

  if (asNumber(input.amountDue) <= 0) {
    return "PAID" as const;
  }

  if (asNumber(input.amountPaid) > 0) {
    return "PARTIALLY_PAID" as const;
  }

  return input.currentStatus === "DRAFT" ? "DRAFT" : "APPROVED";
}
