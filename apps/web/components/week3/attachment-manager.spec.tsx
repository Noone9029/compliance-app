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

import { AttachmentManager } from "./attachment-manager";

describe("AttachmentManager", () => {
  beforeEach(() => {
    refresh.mockReset();
    fetchMock.mockReset();
  });

  it("uploads a real file via multipart form data", async () => {
    fetchMock.mockResolvedValue({
      ok: true
    });

    render(
      <AttachmentManager
        attachments={[]}
        canWrite
        relatedId="invoice_1"
        relatedType="sales-invoice"
      />
    );

    const fileInput = screen.getByLabelText("Upload attachment");
    const file = new File(["hello"], "proof.txt", { type: "text/plain" });

    fireEvent.change(fileInput, {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/v1/files/upload",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.any(FormData)
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("deletes an attachment when allowed", async () => {
    fetchMock.mockResolvedValue({
      ok: true
    });

    render(
      <AttachmentManager
        attachments={[
          {
            id: "file_1",
            organizationId: "org_1",
            storageProvider: "S3_COMPAT",
            bucket: "daftar-local",
            objectKey: "org_1/proof.txt",
            originalFileName: "proof.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
            checksumSha256: "abc",
            relatedType: "sales-invoice",
            relatedId: "invoice_1",
            metadata: null,
            createdAt: "2026-04-18T10:00:00.000Z"
          }
        ]}
        canWrite
        relatedId="invoice_1"
        relatedType="sales-invoice"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/v1/files/file_1",
        expect.objectContaining({
          method: "DELETE",
          credentials: "include"
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });
});
