import assert from "node:assert/strict";
import test from "node:test";
import { occupiesDay, occupiesRoom, sharedBookingName } from "../src/lib/booking-calendar";
import { buildSheetsBatch, GoogleSheet, ReportTab, reportCell, retryAfterMs, SHEETS_MARKER, spreadsheetIdFromInput } from "../src/lib/sheets-report";

const tab: ReportTab = { key: "bookings", title: "Reebok - Bookings", headers: ["Name", "Amount"], rows: [["=IMPORTXML(\"https://invalid\")", 123]] };
test("calendar night and room boundaries include pending accommodation but not checkout", () => {
  const booking = { startDate: "2027-01-01T00:00:00Z", endDate: "2027-01-03T00:00:00Z", scope: "ROOM_SPECIFIC", rooms: [{ id: "A", name: "Room A", guestCount: 2 }] };
  assert.equal(occupiesDay(booking, "2027-01-01"), true);
  assert.equal(occupiesDay(booking, "2027-01-03"), false);
  assert.equal(occupiesRoom(booking, "A"), true);
  assert.equal(occupiesRoom(booking, "B"), false);
  assert.equal(occupiesRoom({ ...booking, scope: "WHOLE_HOUSE" }, "B"), true);
  assert.equal(occupiesRoom({ ...booking, rooms: [] }, "B"), true);
});
test("only family-capable account names are shared; external guest stays remain anonymous", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "SHAREHOLDER", "FAMILY_MEMBER"] as const) assert.equal(sharedBookingName({ requestedBy: { name: "Family Name", role } }), "Family Name");
  assert.equal(sharedBookingName({ requestedBy: { name: "Private guest", role: "GUEST" } }), "Guest stay");
  assert.equal(sharedBookingName({ requestedBy: null }), "Guest stay");
});
test("Sheets target accepts only fixed Google URLs or opaque IDs", () => {
  const id = "test_workbook_id_123456789";
  assert.equal(spreadsheetIdFromInput(id), id);
  assert.equal(spreadsheetIdFromInput(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  for (const url of ["http://127.0.0.1/private", `https://docs.google.com.evil.test/spreadsheets/d/${id}`, `https://user:pass@docs.google.com/spreadsheets/d/${id}`, `http://docs.google.com/spreadsheets/d/${id}`, "short", "https://drive.google.com/drive/folders/not-a-sheet"]) assert.throws(() => spreadsheetIdFromInput(url));
});
test("report writes literal text, numbers and booleans, never formulas", () => {
  for (const text of ["=IMPORTDATA(\"https://bad\")", "+123", "@SUM(A1)", "-123"]) assert.deepEqual(reportCell(text), { userEnteredValue: { stringValue: text } });
  assert.deepEqual(reportCell(123), { userEnteredValue: { numberValue: 123 } });
  assert.deepEqual(reportCell(true), { userEnteredValue: { boolValue: true } });
  assert.throws(() => reportCell(NaN));
  assert.throws(() => reportCell("a".repeat(40001)));
});
test("one batch owns newly created tabs and refuses existing unowned tabs", () => {
  const batch = buildSheetsBatch([tab], [{ properties: { title: "My notes", sheetId: 12 } }]);
  const requests = batch.requests as Record<string, any>[];
  const id = requests[0].addSheet.properties.sheetId;
  assert.notEqual(id, 12);
  assert.equal(requests[1].createDeveloperMetadata.developerMetadata.metadataKey, SHEETS_MARKER);
  assert.equal(requests[2].updateCells.range.sheetId, id);
  assert.equal(requests[2].updateCells.rows[1].values[0].userEnteredValue.stringValue, tab.rows[0][0]);
  assert.equal(/"sheetId":12(?=[,}])/.test(JSON.stringify(batch)), false);
  assert.throws(() => buildSheetsBatch([tab], [{ properties: { title: tab.title, sheetId: 12 } }]), /not owned/);
});
test("owned tabs retain identity, clear stale cells atomically and reject duplicate ownership", () => {
  const owned: GoogleSheet = { properties: { sheetId: 42, title: "Renamed report", gridProperties: { rowCount: 500, columnCount: 10 } }, developerMetadata: [{ metadataKey: SHEETS_MARKER, metadataValue: tab.key }] };
  const requests = buildSheetsBatch([tab], [owned]).requests as Record<string, any>[];
  assert.equal(requests.some((r) => r.addSheet || r.deleteSheet), false);
  assert.deepEqual(requests[1].updateCells.range, { sheetId: 42, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 10 });
  assert.equal(requests[1].updateCells.fields, "userEnteredValue");
  assert.throws(() => buildSheetsBatch([tab], [owned, { ...owned, properties: { sheetId: 43, title: "Duplicate" } }]), /Multiple managed/);
  assert.throws(() => buildSheetsBatch([tab, { ...tab, key: "expenses", title: "Reebok - Expenses" }], [{ ...owned, developerMetadata: [...owned.developerMetadata!, { metadataKey: SHEETS_MARKER, metadataValue: "expenses" }] }]), /conflicting report ownership/);
});
test("oversized snapshots fail closed and retry delays are bounded", () => {
  assert.throws(() => buildSheetsBatch([{ ...tab, rows: Array.from({ length: 80 }, () => ["x".repeat(30000), 1]) }], []), /2 MB/);
  assert.deepEqual([1, 2, 3, 4, 5, 100].map(retryAfterMs), [5, 10, 20, 40, 60, 60].map((n) => n * 60000));
});
