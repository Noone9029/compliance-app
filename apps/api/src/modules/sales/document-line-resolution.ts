import { BadRequestException } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import type { DraftDocumentLine } from "./document-calculations";

export async function resolveDocumentLines(
  prisma: PrismaService,
  organizationId: string,
  lines: DraftDocumentLine[],
) {
  if (lines.length === 0) {
    throw new BadRequestException("At least one line is required.");
  }

  const taxRateIds = Array.from(
    new Set(
      lines
        .map((line) => line.taxRateId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const inventoryItemIds = Array.from(
    new Set(
      lines
        .map((line) => line.inventoryItemId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [taxRates, inventoryItems] = await Promise.all([
    taxRateIds.length
      ? prisma.taxRate.findMany({
          where: {
            organizationId,
            id: { in: taxRateIds },
          },
        })
      : [],
    inventoryItemIds.length
      ? prisma.inventoryItem.findMany({
          where: {
            organizationId,
            id: { in: inventoryItemIds },
          },
        })
      : [],
  ]);

  if (taxRates.length !== taxRateIds.length) {
    throw new BadRequestException("One or more tax rates were not found.");
  }

  if (inventoryItems.length !== inventoryItemIds.length) {
    throw new BadRequestException("One or more inventory items were not found.");
  }

  const taxRateMap = new Map(taxRates.map((taxRate) => [taxRate.id, taxRate]));
  const inventoryItemMap = new Map(
    inventoryItems.map((inventoryItem) => [inventoryItem.id, inventoryItem]),
  );

  return lines.map((line) => {
    const taxRate = line.taxRateId ? taxRateMap.get(line.taxRateId) : null;
    const inventoryItem = line.inventoryItemId
      ? inventoryItemMap.get(line.inventoryItemId)
      : null;
    const description = line.description?.trim() || inventoryItem?.itemName || "";

    if (!description) {
      throw new BadRequestException("Line description is required.");
    }

    return {
      description,
      inventoryItemId: inventoryItem?.id ?? null,
      inventoryItemCode: inventoryItem?.itemCode ?? line.inventoryItemCode ?? null,
      inventoryItemName: inventoryItem?.itemName ?? line.inventoryItemName ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRateId: taxRate?.id ?? null,
      taxRateName: taxRate?.name ?? line.taxRateName ?? null,
      taxRatePercent: taxRate?.rate.toString() ?? line.taxRatePercent ?? 0,
    };
  });
}
