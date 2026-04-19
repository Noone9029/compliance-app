import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const refresh = vi.fn();
const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh
  })
}));

import { PaymentForm } from "./payment-form";

describe("PaymentForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    fetchMock.mockReset();
  });

  it("records payments against an explicit bank account", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    render(
      <PaymentForm
        bankAccounts={[
          {
            id: "bank_1",
            name: "Operating Account",
            currencyCode: "SAR"
          }
        ]}
        canWrite
        defaultAmount="250.00"
        endpoint="/v1/sales/invoices/invoice_1/payments"
        title="Add Payment"
      />
    );

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "125.00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Record Payment" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/v1/sales/invoices/invoice_1/payments",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          body: expect.stringContaining("\"bankAccountId\":\"bank_1\"")
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a setup message when no active bank account is available", () => {
    render(
      <PaymentForm
        bankAccounts={[]}
        canWrite
        defaultAmount="250.00"
        endpoint="/v1/sales/invoices/invoice_1/payments"
        title="Add Payment"
      />
    );

    expect(
      screen.getByText("Add an active bank account in settings before recording payments.")
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Record Payment" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
