import assert from "node:assert/strict";
import test from "node:test";
import { assertStayLength, validateStay } from "../src/lib/availability";
import { dateAfterNights, maxStayNights } from "../src/lib/stay-limits";

test("member stays accept ten nights and reject eleven across month and year boundaries", () => {
  assert.equal(maxStayNights("INTERNAL"), 10);
  for (const start of ["2027-01-27", "2027-12-27", "2028-02-25"]) {
    assert.equal(validateStay(start, dateAfterNights(start, 10)!, start, "INTERNAL"), 10);
    assert.throws(() => validateStay(start, dateAfterNights(start, 11)!, start, "INTERNAL"), /10 nights.*member\/family/);
  }
});

test("public and external channel guest stays retain their ninety-night boundary", () => {
  for (const source of ["EXTERNAL_PUBLIC", "MANUAL_IMPORT", "AIRBNB", "BOOKING_COM"] as const) {
    assert.equal(maxStayNights(source), 90);
    assert.doesNotThrow(() => assertStayLength(90, source));
    assert.throws(() => assertStayLength(91, source), /90 nights/);
  }
  assert.equal(validateStay("2027-01-01", "2027-04-01", "2027-01-01", "EXTERNAL_PUBLIC"), 90);
});

test("stay limits reject zero, negative, fractional and non-finite durations", () => {
  for (const source of ["INTERNAL", "EXTERNAL_PUBLIC"] as const) {
    for (const nights of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => assertStayLength(nights, source));
    assert.doesNotThrow(() => assertStayLength(1, source));
  }
});

test("date-input bounds use calendar nights without timezone or rollover ambiguity", () => {
  assert.equal(dateAfterNights("2028-02-25", 10), "2028-03-06");
  assert.equal(dateAfterNights("2027-12-27", 10), "2028-01-06");
  for (const invalid of ["", "bad-date", "2027-02-29", "2027-01-01T00:00:00Z"]) assert.equal(dateAfterNights(invalid, 10), undefined);
});
