import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export type DocumentPdfVariant = "full" | "packing-slip" | "small";

export type ExportDocumentLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxLabel?: string | null;
  lineTotal: string;
};

export type ExportDocumentMetric = {
  label: string;
  value: string;
};

export type ExportDocumentRecord = {
  title: string;
  number: string;
  status: string;
  contactName: string;
  contactEmail?: string | null;
  issueDate: string;
  dueLabel: string;
  dueValue: string;
  currencyCode: string;
  notes: string | null;
  lines: ExportDocumentLine[];
  totals: ExportDocumentMetric[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 42;
const BODY_FONT_SIZE = 10;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (const word of words.slice(1)) {
    const candidate = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

function drawTextBlock(input: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize?: number;
  lineGap?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const fontSize = input.fontSize ?? BODY_FONT_SIZE;
  const lineGap = input.lineGap ?? 4;
  const color = input.color ?? rgb(0.13, 0.19, 0.28);
  const lines = wrapText(input.text, input.maxWidth, input.font, fontSize);
  let y = input.y;

  for (const line of lines) {
    input.page.drawText(line, {
      x: input.x,
      y,
      size: fontSize,
      font: input.font,
      color
    });
    y -= fontSize + lineGap;
  }

  return y;
}

function drawRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: PAGE_MARGIN, y },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
    thickness: 1,
    color: rgb(0.9, 0.92, 0.95)
  });
}

export async function buildDocumentPdf(
  document: ExportDocumentRecord,
  variant: DocumentPdfVariant
) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  page.drawText(document.title.toUpperCase(), {
    x: PAGE_MARGIN,
    y,
    size: 11,
    font: boldFont,
    color: rgb(0.32, 0.56, 0.25)
  });
  y -= 24;

  page.drawText(document.number, {
    x: PAGE_MARGIN,
    y,
    size: 22,
    font: boldFont,
    color: rgb(0.07, 0.1, 0.15)
  });
  y -= 16;

  page.drawText(`Status: ${document.status}`, {
    x: PAGE_MARGIN,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0.34, 0.39, 0.46)
  });

  page.drawText(`Variant: ${variant}`, {
    x: PAGE_WIDTH - PAGE_MARGIN - 90,
    y,
    size: 10,
    font: regularFont,
    color: rgb(0.34, 0.39, 0.46)
  });
  y -= 24;

  const metadataRows = [
    ["Contact", document.contactName],
    ["Email", document.contactEmail ?? "Not recorded"],
    ["Issue Date", formatDate(document.issueDate)],
    [document.dueLabel, formatDate(document.dueValue)],
    ["Currency", document.currencyCode]
  ] as const;

  for (const [index, [label, value]] of metadataRows.entries()) {
    const columnX = index % 2 === 0 ? PAGE_MARGIN : PAGE_MARGIN + 260;
    const rowY = y - Math.floor(index / 2) * 40;
    page.drawText(label, {
      x: columnX,
      y: rowY,
      size: 9,
      font: boldFont,
      color: rgb(0.34, 0.39, 0.46)
    });
    drawTextBlock({
      page,
      font: regularFont,
      text: value,
      x: columnX,
      y: rowY - 14,
      maxWidth: 220,
      fontSize: 11
    });
  }
  y -= 104;

  if (document.notes) {
    page.drawText("Notes", {
      x: PAGE_MARGIN,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.34, 0.39, 0.46)
    });
    y = drawTextBlock({
      page,
      font: regularFont,
      text: document.notes,
      x: PAGE_MARGIN,
      y: y - 14,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      fontSize: 10
    });
    y -= 8;
  }

  drawRule(page, y);
  y -= 24;

  const showMonetaryColumns = variant !== "packing-slip";
  const descriptionWidth = showMonetaryColumns ? 250 : 360;
  const quantityX = PAGE_MARGIN + descriptionWidth + 8;
  const unitPriceX = quantityX + 60;
  const totalX = unitPriceX + 90;

  page.drawText("Description", {
    x: PAGE_MARGIN,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0.34, 0.39, 0.46)
  });
  page.drawText("Qty", {
    x: quantityX,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0.34, 0.39, 0.46)
  });

  if (showMonetaryColumns) {
    page.drawText("Unit Price", {
      x: unitPriceX,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.34, 0.39, 0.46)
    });
    page.drawText("Line Total", {
      x: totalX,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.34, 0.39, 0.46)
    });
  }

  y -= 18;
  drawRule(page, y);
  y -= 18;

  for (const line of document.lines) {
    const descriptionLines = wrapText(line.description, descriptionWidth, regularFont, BODY_FONT_SIZE);
    const rowHeight = Math.max(descriptionLines.length, line.taxLabel && showMonetaryColumns ? 2 : 1) * 16;

    if (y - rowHeight < PAGE_MARGIN + 110) {
      addPage();
    }

    let descriptionY = y;
    for (const descriptionLine of descriptionLines) {
      page.drawText(descriptionLine, {
        x: PAGE_MARGIN,
        y: descriptionY,
        size: BODY_FONT_SIZE,
        font: regularFont,
        color: rgb(0.13, 0.19, 0.28)
      });
      descriptionY -= 14;
    }

    page.drawText(line.quantity, {
      x: quantityX,
      y,
      size: BODY_FONT_SIZE,
      font: regularFont,
      color: rgb(0.13, 0.19, 0.28)
    });

    if (showMonetaryColumns) {
      page.drawText(line.unitPrice, {
        x: unitPriceX,
        y,
        size: BODY_FONT_SIZE,
        font: regularFont,
        color: rgb(0.13, 0.19, 0.28)
      });
      page.drawText(line.lineTotal, {
        x: totalX,
        y,
        size: BODY_FONT_SIZE,
        font: regularFont,
        color: rgb(0.13, 0.19, 0.28)
      });

      if (line.taxLabel) {
        page.drawText(line.taxLabel, {
          x: unitPriceX,
          y: y - 14,
          size: 8.5,
          font: regularFont,
          color: rgb(0.43, 0.48, 0.56)
        });
      }
    }

    y -= rowHeight;
    drawRule(page, y + 4);
    y -= 10;
  }

  if (showMonetaryColumns && document.totals.length > 0) {
    if (y < PAGE_MARGIN + 120) {
      addPage();
    }

    y -= 12;
    for (const metric of document.totals) {
      page.drawText(metric.label, {
        x: PAGE_WIDTH - PAGE_MARGIN - 180,
        y,
        size: 10,
        font: metric.label.toLowerCase().includes("total") ? boldFont : regularFont,
        color: rgb(0.34, 0.39, 0.46)
      });
      page.drawText(metric.value, {
        x: PAGE_WIDTH - PAGE_MARGIN - 70,
        y,
        size: 10,
        font: metric.label.toLowerCase().includes("total") ? boldFont : regularFont,
        color: rgb(0.13, 0.19, 0.28)
      });
      y -= 16;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
