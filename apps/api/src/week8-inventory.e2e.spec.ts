import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 8 inventory", () => {
  let app: INestApplication;

  async function signIn(email: string) {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email, password: "Password123!" })
      .expect(201);

    return response.headers["set-cookie"];
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists seeded inventory items and returns stock movement detail", async () => {
    const cookies = await signIn("admin@daftar.local");

    const listResponse = await request(app.getHttpServer())
      .get("/v1/inventory/items")
      .set("Cookie", cookies)
      .expect(200);

    expect(listResponse.body.length).toBeGreaterThan(0);
    expect(listResponse.body[0].itemCode).toMatch(/^ITM-/);

    const detailResponse = await request(app.getHttpServer())
      .get(`/v1/inventory/items/${listResponse.body[0].id}`)
      .set("Cookie", cookies)
      .expect(200);

    expect(detailResponse.body.movements.length).toBeGreaterThan(0);
    expect(detailResponse.body.quantityOnHand).toBeTruthy();
  });

  it("creates an inventory item and posts a stock adjustment", async () => {
    const cookies = await signIn("admin@daftar.local");

    const createResponse = await request(app.getHttpServer())
      .post("/v1/inventory/items")
      .set("Cookie", cookies)
      .send({
        itemCode: "ITM-9901",
        itemName: "Spec Inventory Item",
        description: "Created by week 8 e2e spec.",
        costPrice: "10.00",
        salePrice: "15.00",
        quantityOnHand: "3.00",
      })
      .expect(201);

    expect(createResponse.body.itemCode).toBe("ITM-9901");
    expect(createResponse.body.quantityOnHand).toBe("3.00");

    const adjustmentResponse = await request(app.getHttpServer())
      .post(`/v1/inventory/items/${createResponse.body.id}/adjustments`)
      .set("Cookie", cookies)
      .send({
        movementType: "ADJUSTMENT_IN",
        quantity: "2.00",
        reference: "COUNT-001",
        notes: "Weekly stock count.",
      })
      .expect(201);

    expect(adjustmentResponse.body.quantityOnHand).toBe("5.00");
    expect(adjustmentResponse.body.movements[0].movementType).toBe(
      "ADJUSTMENT_IN",
    );
  });

  it("imports inventory items from CSV", async () => {
    const cookies = await signIn("admin@daftar.local");
    const csv = [
      "itemCode,itemName,description,costPrice,salePrice,quantityOnHand",
      "ITM-CSV-9901,CSV Imported Item,Imported by e2e,12.50,19.99,7.00",
    ].join("\n");

    const importResponse = await request(app.getHttpServer())
      .post("/v1/inventory/imports")
      .set("Cookie", cookies)
      .send({
        originalFileName: "inventory-import.csv",
        mimeType: "text/csv",
        contentBase64: Buffer.from(csv, "utf8").toString("base64"),
      })
      .expect(201);

    expect(importResponse.body.importedCount).toBe(1);
    expect(importResponse.body.createdCount).toBe(1);

    const listResponse = await request(app.getHttpServer())
      .get("/v1/inventory/items?search=ITM-CSV-9901")
      .set("Cookie", cookies)
      .expect(200);

    expect(listResponse.body[0].itemCode).toBe("ITM-CSV-9901");

    const detailResponse = await request(app.getHttpServer())
      .get(`/v1/inventory/items/${listResponse.body[0].id}`)
      .set("Cookie", cookies)
      .expect(200);

    expect(detailResponse.body.movements[0].movementType).toBe("IMPORT");
    expect(detailResponse.body.quantityOnHand).toBe("7.00");
  });

  it("blocks inventory deletion for read-only viewers", async () => {
    const cookies = await signIn("viewer@daftar.local");

    const listResponse = await request(app.getHttpServer())
      .get("/v1/inventory/items")
      .set("Cookie", cookies)
      .expect(200);

    await request(app.getHttpServer())
      .delete("/v1/inventory/items")
      .set("Cookie", cookies)
      .send({
        itemIds: [listResponse.body[0].id],
      })
      .expect(403);
  });
});
