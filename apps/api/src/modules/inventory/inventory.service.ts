import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  InventoryImportResult,
  InventoryItemDetail,
  InventoryItemSummary,
  PurchaseBillStatus,
  SalesInvoiceStatus,
  StockMovementRecord,
} from "@daftar/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { FilesService } from "../files/files.service";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

type InventoryItemInput = {
  itemCode: string;
  itemName: string;
  description?: string | null;
  costPrice: string;
  salePrice: string;
  quantityOnHand?: string;
};

type StockAdjustmentInput = {
  movementType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  quantity: string;
  reference?: string | null;
  notes?: string | null;
};

type InventoryImportInput = {
  originalFileName: string;
  mimeType: string;
  contentBase64: string;
};

type DocumentInventoryLine = {
  inventoryItemId: string | null;
  quantity: string | number;
  description: string;
};

type ParsedInventoryImportRow = {
  itemCode: string;
  itemName: string;
  description: string | null;
  costPrice: string;
  salePrice: string;
  quantityOnHand?: string;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvRecords(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue.trim());
      currentValue = "";

      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseInventoryImportRows(content: string) {
  const records = parseCsvRecords(content);

  if (records.length < 2) {
    throw new BadRequestException(
      "Inventory import requires a header row and at least one item row.",
    );
  }

  const [headerRow, ...valueRows] = records;
  const headers = headerRow.map(normalizeHeader);

  const itemCodeIndex = headers.findIndex((header) =>
    ["itemcode", "code", "sku"].includes(header),
  );
  const itemNameIndex = headers.findIndex((header) =>
    ["itemname", "name"].includes(header),
  );
  const descriptionIndex = headers.findIndex((header) => header === "description");
  const costPriceIndex = headers.findIndex((header) =>
    ["costprice", "cost"].includes(header),
  );
  const salePriceIndex = headers.findIndex((header) =>
    ["saleprice", "price", "sellingprice"].includes(header),
  );
  const quantityIndex = headers.findIndex((header) =>
    [
      "quantity",
      "quantityonhand",
      "openingquantity",
      "onhandquantity",
    ].includes(header),
  );

  if (itemCodeIndex === -1 || itemNameIndex === -1) {
    throw new BadRequestException(
      "Inventory import headers must include itemCode and itemName columns.",
    );
  }

  return valueRows.map((row, rowIndex) => {
    const itemCode = row[itemCodeIndex]?.trim().toUpperCase() ?? "";
    const itemName = row[itemNameIndex]?.trim() ?? "";

    if (!itemCode || !itemName) {
      throw new BadRequestException(
        `Inventory import row ${rowIndex + 2} is missing an item code or item name.`,
      );
    }

    return {
      itemCode,
      itemName,
      description:
        descriptionIndex >= 0 ? row[descriptionIndex]?.trim() || null : null,
      costPrice:
        costPriceIndex >= 0 ? row[costPriceIndex]?.trim() || "0.00" : "0.00",
      salePrice:
        salePriceIndex >= 0 ? row[salePriceIndex]?.trim() || "0.00" : "0.00",
      quantityOnHand:
        quantityIndex >= 0 ? row[quantityIndex]?.trim() || undefined : undefined,
    } satisfies ParsedInventoryImportRow;
  });
}

function invoiceConsumesInventory(status: SalesInvoiceStatus) {
  return status !== "DRAFT" && status !== "VOID";
}

function billAffectsInventory(status: PurchaseBillStatus) {
  return status !== "DRAFT" && status !== "VOID";
}

@Injectable()
export class InventoryService {
  private readonly prisma: PrismaService;
  private readonly filesService: FilesService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(FilesService) filesService: FilesService,
  ) {
    this.prisma = prisma;
    this.filesService = filesService;
  }

  async listItems(
    organizationId: string,
    search?: string,
  ): Promise<InventoryItemSummary[]> {
    const term = search?.trim();
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        organizationId,
        ...(term
          ? {
              OR: [
                { itemCode: { contains: term, mode: "insensitive" } },
                { itemName: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ itemCode: "asc" }],
    });

    return items.map((item) => this.mapItemSummary(item));
  }

  async getItem(
    organizationId: string,
    itemId: string,
  ): Promise<InventoryItemDetail> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId },
      include: {
        movements: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });

    if (!item) {
      throw new NotFoundException("Inventory item not found.");
    }

    return this.mapItemDetail(item);
  }

  async createItem(
    organizationId: string,
    input: InventoryItemInput,
  ): Promise<InventoryItemDetail> {
    const itemCode = input.itemCode.trim().toUpperCase();
    await this.ensureItemCodeAvailable(organizationId, itemCode);

    const quantityOnHand = Number(input.quantityOnHand ?? 0);
    this.assertMoneyField(input.costPrice, "Cost price");
    this.assertMoneyField(input.salePrice, "Sale price");
    this.assertNonNegative(quantityOnHand, "Opening quantity");

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          organizationId,
          itemCode,
          itemName: input.itemName.trim(),
          description: input.description?.trim() || null,
          costPrice: money(input.costPrice),
          salePrice: money(input.salePrice),
          quantityOnHand: money(quantityOnHand),
        },
      });

      if (quantityOnHand > 0) {
        await tx.stockMovement.create({
          data: {
            organizationId,
            inventoryItemId: created.id,
            movementType: "OPENING",
            quantityDelta: money(quantityOnHand),
            quantityAfter: money(quantityOnHand),
            reference: "OPENING-BALANCE",
            notes: "Opening balance from item creation.",
          },
        });
      }

      return created;
    });

    return this.getItem(organizationId, item.id);
  }

  async updateItem(
    organizationId: string,
    itemId: string,
    input: InventoryItemInput,
  ): Promise<InventoryItemDetail> {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException("Inventory item not found.");
    }

    const itemCode = input.itemCode.trim().toUpperCase();
    await this.ensureItemCodeAvailable(organizationId, itemCode, itemId);
    this.assertMoneyField(input.costPrice, "Cost price");
    this.assertMoneyField(input.salePrice, "Sale price");

    await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        itemCode,
        itemName: input.itemName.trim(),
        description: input.description?.trim() || null,
        costPrice: money(input.costPrice),
        salePrice: money(input.salePrice),
      },
    });

    return this.getItem(organizationId, itemId);
  }

  async importItems(
    organizationId: string,
    userId: string,
    input: InventoryImportInput,
  ): Promise<InventoryImportResult> {
    const decodedContent = Buffer.from(input.contentBase64, "base64").toString("utf8");
    const rows = parseInventoryImportRows(decodedContent);
    const file = await this.filesService.uploadFile(organizationId, userId, {
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      buffer: Buffer.from(input.contentBase64, "base64"),
      metadata: {
        label: "Inventory import source file",
      },
    });

    let createdCount = 0;
    let updatedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      const existingItems = await tx.inventoryItem.findMany({
        where: {
          organizationId,
          itemCode: {
            in: rows.map((row) => row.itemCode),
          },
        },
      });
      const existingItemMap = new Map(
        existingItems.map((existingItem) => [existingItem.itemCode, existingItem]),
      );

      for (const row of rows) {
        this.assertMoneyField(row.costPrice, "Cost price");
        this.assertMoneyField(row.salePrice, "Sale price");
        if (row.quantityOnHand !== undefined) {
          this.assertMoneyField(row.quantityOnHand, "Imported quantity");
        }

        const existingItem = existingItemMap.get(row.itemCode);

        if (!existingItem) {
          const createdItem = await tx.inventoryItem.create({
            data: {
              organizationId,
              itemCode: row.itemCode,
              itemName: row.itemName,
              description: row.description,
              costPrice: money(row.costPrice),
              salePrice: money(row.salePrice),
              quantityOnHand: money(row.quantityOnHand ?? "0"),
            },
          });

          const importedQuantity = Number(row.quantityOnHand ?? 0);
          if (importedQuantity > 0) {
            await tx.stockMovement.create({
              data: {
                organizationId,
                inventoryItemId: createdItem.id,
                movementType: "IMPORT",
                quantityDelta: money(importedQuantity),
                quantityAfter: money(importedQuantity),
                reference: `IMPORT:${file.id}`,
                notes: `Imported from ${input.originalFileName}.`,
              },
            });
          }

          createdCount += 1;
          continue;
        }

        const nextQuantity =
          row.quantityOnHand === undefined
            ? Number(existingItem.quantityOnHand)
            : Number(row.quantityOnHand);
        const quantityDelta = nextQuantity - Number(existingItem.quantityOnHand);

        await tx.inventoryItem.update({
          where: { id: existingItem.id },
          data: {
            itemName: row.itemName,
            description: row.description,
            costPrice: money(row.costPrice),
            salePrice: money(row.salePrice),
            quantityOnHand: money(nextQuantity),
          },
        });

        if (quantityDelta !== 0) {
          await tx.stockMovement.create({
            data: {
              organizationId,
              inventoryItemId: existingItem.id,
              movementType: "IMPORT",
              quantityDelta: money(quantityDelta),
              quantityAfter: money(nextQuantity),
              reference: `IMPORT:${file.id}`,
              notes: `Imported from ${input.originalFileName}.`,
            },
          });
        }

        updatedCount += 1;
      }

      await tx.storedFile.update({
        where: { id: file.id },
        data: {
          metadata: {
            label: "Inventory import source file",
            createdCount,
            updatedCount,
            importedCount: rows.length,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return {
      fileId: file.id,
      originalFileName: input.originalFileName,
      importedCount: rows.length,
      createdCount,
      updatedCount,
    };
  }

  async deleteItems(organizationId: string, itemIds: string[]) {
    if (itemIds.length === 0) {
      throw new BadRequestException("Select at least one inventory item to delete.");
    }

    const scopedItems = await this.prisma.inventoryItem.findMany({
      where: {
        organizationId,
        id: { in: itemIds },
      },
      select: {
        id: true,
        itemCode: true,
        quantityOnHand: true,
        _count: {
          select: {
            salesInvoiceLines: true,
            purchaseBillLines: true,
            quoteLines: true,
          },
        },
      },
    });

    if (scopedItems.length !== itemIds.length) {
      throw new BadRequestException("One or more selected items were not found.");
    }

    const blockedItems = scopedItems.filter(
      (item) =>
        Number(item.quantityOnHand) > 0 ||
        item._count.salesInvoiceLines > 0 ||
        item._count.purchaseBillLines > 0 ||
        item._count.quoteLines > 0,
    );

    if (blockedItems.length > 0) {
      throw new BadRequestException(
        `Clear stock and unlink documents before deleting: ${blockedItems
          .map((item) => item.itemCode)
          .join(", ")}.`,
      );
    }

    const result = await this.prisma.inventoryItem.deleteMany({
      where: {
        organizationId,
        id: { in: itemIds },
      },
    });

    return { deletedCount: result.count };
  }

  async adjustStock(
    organizationId: string,
    itemId: string,
    input: StockAdjustmentInput,
  ): Promise<InventoryItemDetail> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId },
    });

    if (!item) {
      throw new NotFoundException("Inventory item not found.");
    }

    const quantity = Number(input.quantity);
    this.assertNonNegative(quantity, "Adjustment quantity");

    if (quantity <= 0) {
      throw new BadRequestException("Adjustment quantity must be greater than zero.");
    }

    const signedDelta =
      input.movementType === "ADJUSTMENT_OUT" ? quantity * -1 : quantity;
    const nextQuantity = Number(item.quantityOnHand) + signedDelta;

    if (nextQuantity < 0) {
      throw new BadRequestException(
        "This adjustment would make the item quantity negative.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          quantityOnHand: money(nextQuantity),
        },
      });

      await tx.stockMovement.create({
        data: {
          organizationId,
          inventoryItemId: itemId,
          movementType: input.movementType,
          quantityDelta: money(signedDelta),
          quantityAfter: money(nextQuantity),
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
    });

    return this.getItem(organizationId, itemId);
  }

  async syncSalesInvoiceInventory(input: {
    organizationId: string;
    invoiceId: string;
    invoiceNumber: string;
    status: SalesInvoiceStatus;
    lines: DocumentInventoryLine[];
  }, transaction?: Prisma.TransactionClient) {
    await this.syncDocumentInventory({
      organizationId: input.organizationId,
      reference: `SALES-INVOICE:${input.invoiceId}`,
      documentNumber: input.invoiceNumber,
      active: invoiceConsumesInventory(input.status),
      lines: input.lines,
      movementType: "SALES_INVOICE",
      quantityDirection: -1,
      underflowMessagePrefix: "This invoice would make",
    }, transaction);
  }

  async syncPurchaseBillInventory(input: {
    organizationId: string;
    billId: string;
    billNumber: string;
    status: PurchaseBillStatus;
    lines: DocumentInventoryLine[];
  }, transaction?: Prisma.TransactionClient) {
    await this.syncDocumentInventory({
      organizationId: input.organizationId,
      reference: `PURCHASE-BILL:${input.billId}`,
      documentNumber: input.billNumber,
      active: billAffectsInventory(input.status),
      lines: input.lines,
      movementType: "PURCHASE_BILL",
      quantityDirection: 1,
      underflowMessagePrefix: "This bill would make",
    }, transaction);
  }

  private async syncDocumentInventory(input: {
    organizationId: string;
    reference: string;
    documentNumber: string;
    active: boolean;
    lines: DocumentInventoryLine[];
    movementType: "PURCHASE_BILL" | "SALES_INVOICE";
    quantityDirection: 1 | -1;
    underflowMessagePrefix: string;
  }, transaction?: Prisma.TransactionClient) {
    const desiredDeltas = new Map<
      string,
      { quantityDelta: number; description: string }
    >();

    if (input.active) {
      for (const line of input.lines) {
        if (!line.inventoryItemId) {
          continue;
        }

        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(
            "Inventory-linked document lines must use a positive quantity.",
          );
        }

        const existing = desiredDeltas.get(line.inventoryItemId);
        desiredDeltas.set(line.inventoryItemId, {
          quantityDelta:
            (existing?.quantityDelta ?? 0) + quantity * input.quantityDirection,
          description: existing?.description ?? line.description,
        });
      }
    }

    const runSync = async (tx: Prisma.TransactionClient) => {
      const existingMovements = await tx.stockMovement.findMany({
        where: {
          organizationId: input.organizationId,
          reference: input.reference,
        },
      });

      const existingMovementMap = new Map<string, number>();
      for (const movement of existingMovements) {
        existingMovementMap.set(
          movement.inventoryItemId,
          (existingMovementMap.get(movement.inventoryItemId) ?? 0) +
            Number(movement.quantityDelta),
        );
      }

      const affectedItemIds = Array.from(
        new Set([
          ...Array.from(existingMovementMap.keys()),
          ...Array.from(desiredDeltas.keys()),
        ]),
      );

      if (affectedItemIds.length === 0) {
        return;
      }

      const items = await tx.inventoryItem.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: affectedItemIds },
        },
      });
      const itemMap = new Map(items.map((item) => [item.id, item]));

      if (itemMap.size !== affectedItemIds.length) {
        throw new BadRequestException(
          "One or more inventory items linked to this document were not found.",
        );
      }

      const nextQuantityMap = new Map<string, number>();
      for (const itemId of affectedItemIds) {
        const item = itemMap.get(itemId)!;
        const revertedQuantity =
          Number(item.quantityOnHand) - (existingMovementMap.get(itemId) ?? 0);
        const nextQuantity =
          revertedQuantity + (desiredDeltas.get(itemId)?.quantityDelta ?? 0);

        if (nextQuantity < 0) {
          throw new BadRequestException(
            `${input.underflowMessagePrefix} ${item.itemCode} negative.`,
          );
        }

        nextQuantityMap.set(itemId, nextQuantity);
      }

      await tx.stockMovement.deleteMany({
        where: {
          organizationId: input.organizationId,
          reference: input.reference,
        },
      });

      for (const itemId of affectedItemIds) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: {
            quantityOnHand: money(nextQuantityMap.get(itemId)!),
          },
        });
      }

      const nextMovements = Array.from(desiredDeltas.entries())
        .filter(([, entry]) => entry.quantityDelta !== 0)
        .map(([inventoryItemId, entry]) => ({
          organizationId: input.organizationId,
          inventoryItemId,
          movementType: input.movementType,
          quantityDelta: money(entry.quantityDelta),
          quantityAfter: money(nextQuantityMap.get(inventoryItemId)!),
          reference: input.reference,
          notes: `${input.documentNumber} · ${entry.description}`,
        }));

      if (nextMovements.length > 0) {
        await tx.stockMovement.createMany({
          data: nextMovements,
        });
      }
    };

    if (transaction) {
      await runSync(transaction);
      return;
    }

    await this.prisma.$transaction(runSync);
  }

  private mapItemSummary(item: {
    id: string;
    organizationId: string;
    itemCode: string;
    itemName: string;
    description: string | null;
    costPrice: { toString(): string };
    salePrice: { toString(): string };
    quantityOnHand: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
  }): InventoryItemSummary {
    return {
      id: item.id,
      organizationId: item.organizationId,
      itemCode: item.itemCode,
      itemName: item.itemName,
      description: item.description,
      costPrice: money(item.costPrice),
      salePrice: money(item.salePrice),
      quantityOnHand: money(item.quantityOnHand),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private mapItemDetail(item: {
    id: string;
    organizationId: string;
    itemCode: string;
    itemName: string;
    description: string | null;
    costPrice: { toString(): string };
    salePrice: { toString(): string };
    quantityOnHand: { toString(): string };
    createdAt: Date;
    updatedAt: Date;
    movements: {
      id: string;
      organizationId: string;
      inventoryItemId: string;
      movementType: StockMovementRecord["movementType"];
      quantityDelta: { toString(): string };
      quantityAfter: { toString(): string };
      reference: string | null;
      notes: string | null;
      createdAt: Date;
    }[];
  }): InventoryItemDetail {
    return {
      ...this.mapItemSummary(item),
      movements: item.movements.map((movement) => ({
        id: movement.id,
        organizationId: movement.organizationId,
        inventoryItemId: movement.inventoryItemId,
        movementType: movement.movementType,
        quantityDelta: money(movement.quantityDelta),
        quantityAfter: money(movement.quantityAfter),
        reference: movement.reference,
        notes: movement.notes,
        createdAt: movement.createdAt.toISOString(),
      })),
    };
  }

  private assertMoneyField(value: string, label: string) {
    const amount = Number(value);
    this.assertNonNegative(amount, label);
  }

  private assertNonNegative(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${label} must be a non-negative number.`);
    }
  }

  private async ensureItemCodeAvailable(
    organizationId: string,
    itemCode: string,
    excludeItemId?: string,
  ) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: {
        organizationId,
        itemCode,
        ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException(
        "Inventory item code already exists for this organization.",
      );
    }
  }
}
