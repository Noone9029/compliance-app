import { BadRequestException } from "@nestjs/common";

export type DateRangeFilter = {
  from?: Date;
  to?: Date;
};

function parseDateBoundary(value: string, boundary: "start" | "end") {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? `${value.trim()}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value.trim();

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid date value: ${value}`);
  }

  return parsed;
}

export function parseDateRangeQuery(
  from: string | undefined,
  to: string | undefined
): DateRangeFilter {
  const range: DateRangeFilter = {};

  if (from?.trim()) {
    range.from = parseDateBoundary(from, "start");
  }

  if (to?.trim()) {
    range.to = parseDateBoundary(to, "end");
  }

  if (range.from && range.to && range.from > range.to) {
    throw new BadRequestException("From date must be earlier than or equal to to date.");
  }

  return range;
}

export function buildDateRangeInput(range: DateRangeFilter) {
  const input: { gte?: Date; lte?: Date } = {};

  if (range.from) {
    input.gte = range.from;
  }

  if (range.to) {
    input.lte = range.to;
  }

  return Object.keys(input).length > 0 ? input : undefined;
}
