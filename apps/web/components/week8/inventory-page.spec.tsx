import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities, hasPermission } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/inventory/items") {
      return [
        {
          id: "item-1",
          organizationId: "org-1",
          itemCode: "ITM-1001",
          itemName: "Backdrop Panel Set",
          description: "Stage backdrop inventory.",
          costPrice: "1250.00",
          salePrice: "1800.00",
          quantityOnHand: "9.00",
          createdAt: "2026-04-17T00:00:00.000Z",
          updatedAt: "2026-04-17T00:00:00.000Z",
        },
      ];
    }

    if (endpoint === "/v1/inventory/items?search=backdrop") {
      return [
        {
          id: "item-1",
          organizationId: "org-1",
          itemCode: "ITM-1001",
          itemName: "Backdrop Panel Set",
          description: "Stage backdrop inventory.",
          costPrice: "1250.00",
          salePrice: "1800.00",
          quantityOnHand: "9.00",
          createdAt: "2026-04-17T00:00:00.000Z",
          updatedAt: "2026-04-17T00:00:00.000Z",
        },
      ];
    }

    return {
      id: "item-1",
      organizationId: "org-1",
      itemCode: "ITM-1001",
      itemName: "Backdrop Panel Set",
      description: "Stage backdrop inventory.",
      costPrice: "1250.00",
      salePrice: "1800.00",
      quantityOnHand: "9.00",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-17T00:00:00.000Z",
      movements: [
        {
          id: "movement-1",
          organizationId: "org-1",
          inventoryItemId: "item-1",
          movementType: "OPENING",
          quantityDelta: "9.00",
          quantityAfter: "9.00",
          reference: "OPENING-BALANCE",
          notes: "Opening balance from item creation.",
          createdAt: "2026-04-17T00:00:00.000Z",
        },
      ],
    };
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "ACCOUNTANT",
    permissions: [
      "inventory.read",
      "inventory.write",
      "shell.accounting.read",
    ],
  })),
  hasPermission: vi.fn((capabilities, permission) =>
    capabilities.permissions.includes(permission),
  ),
}));

vi.mock("../api", () => ({
  fetchServerJson,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities,
  hasPermission,
}));

import { renderInventoryPage } from "./inventory-page";

describe("inventory page", () => {
  it("renders the inventory list and create form", async () => {
    render(await renderInventoryPage("nomad-events", ["accounting", "inventory"], {}));

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/inventory/items");
    expect(
      screen.getByRole("heading", { level: 2, name: "Inventory" }),
    ).toBeTruthy();
    expect(screen.getByText("ITM-1001")).toBeTruthy();
    expect(screen.getByText("New Inventory Item")).toBeTruthy();
    expect(screen.getByText("Import Items")).toBeTruthy();
    expect(
      screen.getByText(/CSV headers: itemCode, itemName, description/i),
    ).toBeTruthy();
  });

  it("renders the selected item detail and stock adjustment form", async () => {
    render(
      await renderInventoryPage(
        "nomad-events",
        ["accounting", "inventory", "item-1"],
        { search: "backdrop" },
      ),
    );

    expect(fetchServerJson).toHaveBeenCalledWith(
      "/v1/inventory/items?search=backdrop",
    );
    expect(fetchServerJson).toHaveBeenCalledWith("/v1/inventory/items/item-1");
    expect(screen.getByText("Item Detail")).toBeTruthy();
    expect(screen.getByText("Stock Movement History")).toBeTruthy();
    expect(screen.getByText("Adjust Stock")).toBeTruthy();
  });

  it("renders a permission message when inventory access is missing", async () => {
    getCapabilities.mockResolvedValueOnce({
      roleKey: "VIEWER",
      permissions: ["shell.accounting.read"],
    });

    render(await renderInventoryPage("nomad-events", ["accounting", "inventory"], {}));

    expect(
      screen.getByText(/does not currently include inventory access/i),
    ).toBeTruthy();
  });
});
