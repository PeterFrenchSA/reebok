import { randomInt } from "node:crypto";

export type ReportCell = string | number | boolean;
export type ReportTab = { key: string; title: string; headers: string[]; rows: ReportCell[][] };
export type GoogleSheet = { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } }; developerMetadata?: Array<{ metadataKey: string; metadataValue?: string }> };
export const SHEETS_MARKER = "reebok.house-manager.report.v1";
export const REPORT_TITLES = ["Reebok - Bookings", "Reebok - Expenses", "Reebok - Payments", "Reebok - Member Fees", "Reebok - Readme"];
export class SheetsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function spreadsheetIdFromInput(input: string): string {
  if (/^[a-zA-Z0-9_-]{20,120}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,120})(?:\/|$)/);
    if (url.origin === "https://docs.google.com" && !url.username && !url.password && match) return match[1];
  } catch { /* Return a stable, non-sensitive validation error below. */ }
  throw new SheetsError("Paste a Google Sheets URL or spreadsheet ID, not a Drive folder link.");
}
export function retryAfterMs(failures: number) {
  return Math.min(60, 5 * 2 ** Math.min(4, Math.max(0, failures - 1))) * 60000;
}
export function reportCell(value: ReportCell) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SheetsError("A report contains an invalid amount. No spreadsheet data was written.", 422);
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  if (value.length > 40000) throw new SheetsError("A report field is too long to export safely.", 422);
  // Explicit stringValue prevents titles/references beginning with '=' becoming formulas.
  return { userEnteredValue: { stringValue: value } };
}
export function buildSheetsBatch(tabs: ReportTab[], existing: GoogleSheet[]) {
  const requests: object[] = [];
  const usedIds = new Set(existing.map((s) => s.properties.sheetId));
  const reportIds = new Set<number>();
  for (const tab of tabs) {
    const matches = existing.filter((s) => s.developerMetadata?.some((m) => m.metadataKey === SHEETS_MARKER && m.metadataValue === tab.key));
    if (matches.length > 1) throw new SheetsError(`Multiple managed tabs for ${tab.title}. Remove the duplicate metadata before retrying.`, 409);
    const sheet = matches[0];
    if (!sheet && existing.some((s) => s.properties.title === tab.title)) throw new SheetsError(`The tab "${tab.title}" already exists and is not owned by this integration. Rename it before syncing; it will not be overwritten.`, 409);
    let sheetId = sheet?.properties.sheetId ?? randomInt(1, 2_000_000_000);
    while (!sheet && usedIds.has(sheetId)) sheetId = randomInt(1, 2_000_000_000);
    usedIds.add(sheetId);
    if (reportIds.has(sheetId)) throw new SheetsError("A sheet has conflicting report ownership metadata. Correct the metadata before retrying.", 409);
    reportIds.add(sheetId);
    const rowCount = Math.max(100, tab.rows.length + 1, sheet?.properties.gridProperties?.rowCount ?? 0);
    const columnCount = Math.max(tab.headers.length, sheet?.properties.gridProperties?.columnCount ?? 0);
    if (!sheet) {
      requests.push({ addSheet: { properties: { sheetId, title: tab.title, gridProperties: { rowCount, columnCount, frozenRowCount: 1 } } } });
      requests.push({ createDeveloperMetadata: { developerMetadata: { metadataKey: SHEETS_MARKER, metadataValue: tab.key, location: { sheetId }, visibility: "DOCUMENT" } } });
    } else {
      requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount, columnCount, frozenRowCount: 1 } }, fields: "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount" } });
    }
    requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: columnCount },
      rows: [tab.headers, ...tab.rows].map((row) => ({ values: row.map(reportCell) })), fields: "userEnteredValue" } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, endColumnIndex: tab.headers.length },
      cell: { userEnteredFormat: { backgroundColor: { red: 0.08, green: 0.3, blue: 0.32 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: "userEnteredFormat" } });
    requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: tab.rows.length + 1, startColumnIndex: 0, endColumnIndex: tab.headers.length } } } });
  }
  const body = { requests, includeSpreadsheetInResponse: false };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 2_000_000) throw new SheetsError("The full report exceeds the safe 2 MB sync limit. Nothing was written. Ask the operator to extend the reporting pipeline; history is never silently truncated.", 422);
  return body;
}
