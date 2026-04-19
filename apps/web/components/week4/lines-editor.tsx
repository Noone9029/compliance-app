"use client";

import React from "react";

export type LineState = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateId: string;
};

export function LinesEditor({
  canWrite,
  isPending,
  lines,
  setLines,
  taxRates
}: {
  canWrite: boolean;
  isPending: boolean;
  lines: LineState[];
  setLines: React.Dispatch<React.SetStateAction<LineState[]>>;
  taxRates: { id: string; label: string }[];
}) {
  function updateLine(index: number, key: keyof LineState, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: value
            }
          : line
      )
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Line Items</h4>
        <button
          className="text-sm font-medium text-slate-700 underline underline-offset-4"
          disabled={!canWrite || isPending}
          onClick={addLine}
          type="button"
        >
          Add line
        </button>
      </div>
      {lines.map((line, index) => (
        <div
          className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_0.8fr_0.9fr_1fr_auto]"
          key={`${index}-${line.description}`}
        >
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canWrite || isPending}
            onChange={(event) => updateLine(index, "description", event.target.value)}
            placeholder="Description"
            type="text"
            value={line.description}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canWrite || isPending}
            onChange={(event) => updateLine(index, "quantity", event.target.value)}
            placeholder="Qty"
            type="number"
            value={line.quantity}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canWrite || isPending}
            onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
            placeholder="Unit price"
            type="number"
            value={line.unitPrice}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!canWrite || isPending}
            onChange={(event) => updateLine(index, "taxRateId", event.target.value)}
            value={line.taxRateId}
          >
            <option value="">No tax</option>
            {taxRates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.label}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
            disabled={!canWrite || isPending || lines.length === 1}
            onClick={() => removeLine(index)}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
