import { test } from "node:test";
import assert from "node:assert/strict";
import * as np from "../dist/index.js";

const d = (y, m, day) => new Date(y, m - 1, day);

test("bank holidays from the list", () => {
  assert.equal(np.isBankHoliday(d(2026, 10, 21)), true);
  assert.equal(np.getHoliday(d(2026, 10, 21)).name, "Dashain Holiday");
  assert.equal(np.isBankHoliday(d(2026, 10, 26)), false);
  assert.ok(np.getBankHolidays(2026).every((h) => h.bankHoliday));
});

test("holidays for some people only are not bank holidays", () => {
  const teej = np.getHoliday(d(2026, 9, 14));
  assert.equal(teej.bankHoliday, false);
  assert.equal(teej.nationwide, false);
  assert.equal(teej.appliesTo, "Female employees");
  assert.equal(np.isHoliday(d(2026, 9, 14)), true);
  assert.equal(np.isBankHoliday(d(2026, 9, 14)), false);
});

test("weekend is Saturday and Sunday", () => {
  assert.deepEqual([...np.weekend], ["saturday", "sunday"]);
  assert.equal(np.isWeekend(d(2026, 11, 28)), true);  // Saturday
  assert.equal(np.isWeekend(d(2026, 11, 29)), true);  // Sunday
  assert.equal(np.isBankingDay(d(2026, 11, 30)), true); // Monday
});

test("banking days skip weekends and holidays", () => {
  // Friday 16 Oct 2026 + 1: the weekend, then Dashain from 17 to 23 Oct.
  assert.equal(np.addBankingDays(d(2026, 10, 16), 1).toDateString(), d(2026, 10, 26).toDateString());
  assert.equal(np.addBankingDays(d(2026, 10, 26), -1).toDateString(), d(2026, 10, 16).toDateString());
  assert.equal(np.nextBankingDay(d(2026, 11, 6)).toDateString(), d(2026, 11, 13).toDateString()); // Tihar 8–12
  assert.equal(np.addBankingDays(d(2026, 11, 26), 0).toDateString(), d(2026, 11, 26).toDateString());
  assert.throws(() => np.addBankingDays(d(2026, 11, 26), 1.5));
});

test("coverage", () => {
  assert.ok(np.getCoveredYears().includes(2026));
  assert.equal(np.isCovered(d(2030, 1, 1)), false);
  assert.ok(np.source.includes("Nepal Rastra Bank"));
});
