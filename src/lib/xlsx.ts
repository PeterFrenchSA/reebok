import ExcelJS from "exceljs";

function columnNames(data: Array<Record<string, unknown>>): string[] {
  return Array.from(new Set(data.flatMap((row) => Object.keys(row))));
}

function toCellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date || ["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean | Date;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function fromCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date || ["string", "number", "boolean"].includes(typeof value)) {
    return value;
  }

  if (typeof value === "object") {
    if ("result" in value) {
      return fromCellValue(value.result as ExcelJS.CellValue);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }

    if ("text" in value && value.text !== undefined) {
      return String(value.text);
    }
  }

  return JSON.stringify(value);
}

export async function toXlsxBuffer(data: Array<Record<string, unknown>>, sheetName = "Sheet1"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = columnNames(data);

  worksheet.columns = headers.map((header) => ({ header, key: header }));

  for (const row of data) {
    const values: Record<string, ExcelJS.CellValue> = {};
    for (const header of headers) {
      values[header] = toCellValue(row[header]);
    }
    worksheet.addRow(values);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function fromXlsxBuffer(buffer: Buffer): Promise<Array<Record<string, unknown>>> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS v3's Buffer type predates Node's generic Buffer type.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    const header = String(fromCellValue(cell.value)).trim();
    headers[columnNumber - 1] = header;
  });

  const rows: Array<Record<string, unknown>> = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const output: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) {
        output[header] = fromCellValue(row.getCell(index + 1).value);
      }
    });
    rows.push(output);
  });

  return rows;
}
