import test from "node:test";
import assert from "node:assert/strict";
import { getFinancialYear, getChapterCode, getChapterKey } from "../../src/shared/utils/sequence-generator.js";

test("Financial Year calculation matches Indian FY (1st April - 31st March)", () => {
  // Test 1st April 2025 -> 25-26
  assert.equal(getFinancialYear(new Date("2025-04-01T00:00:00Z")), "25-26");
  // Test mid-year 15th October 2025 -> 25-26
  assert.equal(getFinancialYear(new Date("2025-10-15T00:00:00Z")), "25-26");
  // Test 31st March 2026 -> 25-26
  assert.equal(getFinancialYear(new Date("2026-03-31T23:59:59Z")), "25-26");
  // Test 1st April 2026 -> 26-27
  assert.equal(getFinancialYear(new Date("2026-04-01T00:00:00Z")), "26-27");
  // Test 31st March 2027 -> 26-27
  assert.equal(getFinancialYear(new Date("2027-03-31T23:59:59Z")), "26-27");
  // Test 1st January 2026 -> 25-26
  assert.equal(getFinancialYear(new Date("2026-01-10T12:00:00Z")), "25-26");
});

test("Chapter code mapping resolves 3-letter uppercase codes", () => {
  assert.equal(getChapterCode("Pune Chapter"), "PUN");
  assert.equal(getChapterCode("pune"), "PUN");
  assert.equal(getChapterCode("Mumbai Chapter"), "MUM");
  assert.equal(getChapterCode("Delhi"), "DEL");
  assert.equal(getChapterCode("Surat Chapter"), "SUR");
  assert.equal(getChapterCode("Nagpur"), "NAG");
  assert.equal(getChapterCode("Bengaluru Chapter"), "BLR");
  assert.equal(getChapterCode("Bangalore"), "BLR");
  assert.equal(getChapterCode("Navi Mumbai Chapter"), "NVM");
  assert.equal(getChapterCode(""), "CEN");
  assert.equal(getChapterCode(null), "CEN");
});

test("Chapter key normalizes generic suffixes", () => {
  assert.equal(getChapterKey("Pune Chapter"), "pune");
  assert.equal(getChapterKey("pune"), "pune");
  assert.equal(getChapterKey("Mumbai Chamber"), "mumbai");
  assert.equal(getChapterKey(""), "central");
});
