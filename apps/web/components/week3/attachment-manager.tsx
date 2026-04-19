"use client";

import React from "react";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StoredFileRecord } from "@daftar/types";
import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} bytes`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentManager(props: {
  attachments: StoredFileRecord[];
  canWrite: boolean;
  relatedType: string;
  relatedId: string;
  readOnlyMessage?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );

  function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("relatedType", props.relatedType);
        formData.set("relatedId", props.relatedId);
        const response = await fetch(`${apiBaseUrl}/v1/files/upload`, {
          method: "POST",
          credentials: "include",
          body: formData
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Upload failed.");
        }

        if (inputRef.current) {
          inputRef.current.value = "";
        }

        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
      }
    });
  }

  function onDelete(fileId: string) {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/files/${fileId}`, {
          method: "DELETE",
          credentials: "include"
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Delete failed.");
        }

        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Delete failed.");
      }
    });
  }

  return (
    <Card id="attachments">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Attachments</h3>
            <p className="text-sm text-slate-500">
              Upload and download real supporting files linked to this document.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              aria-label="Upload attachment"
              className="hidden"
              disabled={!props.canWrite || isPending}
              onChange={onUpload}
              ref={inputRef}
              type="file"
            />
            <Button
              disabled={!props.canWrite || isPending}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {isPending ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.attachments.length === 0 ? (
          <p className="text-sm text-slate-500">No files linked to this document yet.</p>
        ) : (
          <div className="space-y-3">
            {props.attachments.map((file) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                key={file.id}
              >
                <div>
                  <p className="font-medium text-slate-800">{file.originalFileName}</p>
                  <p className="text-sm text-slate-500">
                    {file.mimeType} • {formatBytes(file.sizeBytes)}
                  </p>
                </div>
                <a
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  href={`${apiBaseUrl}/v1/files/${file.id}/download`}
                >
                  Download
                </a>
                {props.canWrite ? (
                  <button
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:text-rose-700"
                    disabled={isPending}
                    onClick={() => onDelete(file.id)}
                    type="button"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {!props.canWrite && props.readOnlyMessage ? (
          <p className="text-sm text-slate-500">{props.readOnlyMessage}</p>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
