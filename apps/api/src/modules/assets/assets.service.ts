import {
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  DepreciationRunRecord,
  FixedAssetRecord
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

@Injectable()
export class AssetsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listAssets(organizationId: string): Promise<FixedAssetRecord[]> {
    const assets = await this.prisma.fixedAsset.findMany({
      where: { organizationId },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }]
    });

    return assets.map((asset) => this.mapAsset(asset));
  }

  async getAsset(organizationId: string, assetId: string): Promise<FixedAssetRecord> {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, organizationId }
    });

    if (!asset) {
      throw new NotFoundException("Fixed asset not found.");
    }

    return this.mapAsset(asset);
  }

  async createAsset(
    organizationId: string,
    input: {
      assetNumber?: string | null;
      name: string;
      category: string;
      purchaseDate: string;
      cost: string;
      salvageValue: string;
      usefulLifeMonths: number;
      depreciationMethod: string;
    }
  ) {
    const assetNumber =
      input.assetNumber?.trim() || (await this.nextAssetNumber(organizationId));

    const asset = await this.prisma.fixedAsset.create({
      data: {
        organizationId,
        assetNumber,
        name: input.name,
        category: input.category,
        purchaseDate: new Date(input.purchaseDate),
        cost: input.cost,
        salvageValue: input.salvageValue,
        usefulLifeMonths: input.usefulLifeMonths,
        depreciationMethod: input.depreciationMethod,
        accumulatedDepreciation: "0.00",
        netBookValue: input.cost,
        status: "ACTIVE"
      }
    });

    return this.mapAsset(asset);
  }

  async updateAsset(
    organizationId: string,
    assetId: string,
    input: Partial<{
      name: string;
      category: string;
      purchaseDate: string;
      cost: string;
      salvageValue: string;
      usefulLifeMonths: number;
      depreciationMethod: string;
      status: "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED";
    }>
  ) {
    const existing = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, organizationId }
    });

    if (!existing) {
      throw new NotFoundException("Fixed asset not found.");
    }

    const cost = Number(input.cost ?? existing.cost);
    const accumulatedDepreciation = Number(existing.accumulatedDepreciation);
    const nextNetBookValue = Math.max(cost - accumulatedDepreciation, 0).toFixed(2);

    const asset = await this.prisma.fixedAsset.update({
      where: { id: assetId },
      data: {
        name: input.name ?? existing.name,
        category: input.category ?? existing.category,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : existing.purchaseDate,
        cost: input.cost ?? existing.cost,
        salvageValue: input.salvageValue ?? existing.salvageValue,
        usefulLifeMonths: input.usefulLifeMonths ?? existing.usefulLifeMonths,
        depreciationMethod: input.depreciationMethod ?? existing.depreciationMethod,
        status: input.status ?? existing.status,
        netBookValue: nextNetBookValue
      }
    });

    return this.mapAsset(asset);
  }

  async listDepreciationRuns(organizationId: string): Promise<DepreciationRunRecord[]> {
    const runs = await this.prisma.depreciationRun.findMany({
      where: { organizationId },
      orderBy: [{ runDate: "desc" }, { createdAt: "desc" }]
    });

    return runs.map((run) => ({
      id: run.id,
      organizationId: run.organizationId,
      fixedAssetId: run.fixedAssetId,
      runDate: run.runDate.toISOString(),
      depreciationAmount: money(run.depreciationAmount),
      accumulatedDepreciation: money(run.accumulatedDepreciation),
      netBookValue: money(run.netBookValue),
      createdAt: run.createdAt.toISOString()
    }));
  }

  async runDepreciation(
    organizationId: string,
    assetId: string,
    input: { runDate: string }
  ): Promise<{ asset: FixedAssetRecord; run: DepreciationRunRecord }> {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id: assetId, organizationId }
    });

    if (!asset) {
      throw new NotFoundException("Fixed asset not found.");
    }

    const depreciableBase = Math.max(Number(asset.cost) - Number(asset.salvageValue), 0);
    const monthlyDepreciation =
      asset.usefulLifeMonths > 0 ? depreciableBase / asset.usefulLifeMonths : 0;
    const remainingBookValue =
      Number(asset.netBookValue) - Number(asset.salvageValue);
    const depreciationAmount = Math.max(
      Math.min(monthlyDepreciation, remainingBookValue),
      0
    );
    const accumulatedDepreciation =
      Number(asset.accumulatedDepreciation) + depreciationAmount;
    const netBookValue = Math.max(Number(asset.cost) - accumulatedDepreciation, 0);
    const status = netBookValue <= Number(asset.salvageValue)
      ? "FULLY_DEPRECIATED"
      : asset.status;

    const [updatedAsset, run] = await this.prisma.$transaction([
      this.prisma.fixedAsset.update({
        where: { id: assetId },
        data: {
          accumulatedDepreciation: accumulatedDepreciation.toFixed(2),
          netBookValue: netBookValue.toFixed(2),
          lastDepreciatedAt: new Date(input.runDate),
          status
        }
      }),
      this.prisma.depreciationRun.create({
        data: {
          organizationId,
          fixedAssetId: assetId,
          runDate: new Date(input.runDate),
          depreciationAmount: depreciationAmount.toFixed(2),
          accumulatedDepreciation: accumulatedDepreciation.toFixed(2),
          netBookValue: netBookValue.toFixed(2)
        }
      })
    ]);

    return {
      asset: this.mapAsset(updatedAsset),
      run: {
        id: run.id,
        organizationId: run.organizationId,
        fixedAssetId: run.fixedAssetId,
        runDate: run.runDate.toISOString(),
        depreciationAmount: money(run.depreciationAmount),
        accumulatedDepreciation: money(run.accumulatedDepreciation),
        netBookValue: money(run.netBookValue),
        createdAt: run.createdAt.toISOString()
      }
    };
  }

  private mapAsset(asset: {
    id: string;
    organizationId: string;
    assetNumber: string;
    name: string;
    category: string;
    purchaseDate: Date;
    cost: { toString(): string };
    salvageValue: { toString(): string };
    usefulLifeMonths: number;
    depreciationMethod: string;
    accumulatedDepreciation: { toString(): string };
    netBookValue: { toString(): string };
    status: "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED";
    lastDepreciatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): FixedAssetRecord {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      assetNumber: asset.assetNumber,
      name: asset.name,
      category: asset.category,
      purchaseDate: asset.purchaseDate.toISOString(),
      cost: money(asset.cost),
      salvageValue: money(asset.salvageValue),
      usefulLifeMonths: asset.usefulLifeMonths,
      depreciationMethod: asset.depreciationMethod,
      accumulatedDepreciation: money(asset.accumulatedDepreciation),
      netBookValue: money(asset.netBookValue),
      status: asset.status,
      lastDepreciatedAt: asset.lastDepreciatedAt?.toISOString() ?? null,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString()
    };
  }

  private async nextAssetNumber(organizationId: string) {
    const count = await this.prisma.fixedAsset.count({
      where: { organizationId }
    });

    return `FA-${String(count + 1).padStart(4, "0")}`;
  }
}
