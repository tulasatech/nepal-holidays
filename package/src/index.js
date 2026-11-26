// Nepal's public and bank holidays, in the shape of date-fns-holiday-us.
//
// Nepal's holidays follow the Bikram Sambat and lunar calendars and are set by
// the government each year, so unlike US holidays they cannot be calculated:
// this package carries the published list (./data.js, generated from
// github.com/tulasatech/nepal-holidays). Dates outside the covered years are
// unknown, not working days; check isCovered() before relying on an answer.
//
// Like date-fns, a Date is read as the calendar day it falls on in the local
// time zone, and returned dates are at local midnight.
import { data } from "./data.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const byDate = new Map(data.holidays.map((h) => [h.date, h]));

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function shape(h) {
  return {
    date: localDate(h.date),
    isoDate: h.date,
    name: h.name,
    ...(h.nameNe ? { nameNe: h.nameNe } : {}),
    bankHoliday: h.banksClosed,
    nationwide: !h.appliesTo,
    ...(h.appliesTo ? { appliesTo: h.appliesTo } : {}),
  };
}

/** The weekdays banks close every week, e.g. ["saturday", "sunday"]. */
export const weekend = Object.freeze([...data.weekend]);
/** The notice the dates come from, and when the data was last updated. */
export const source = data.source;
export const updated = data.updated;

/** The years the data covers. A year is only partly covered if its list starts mid-year. */
export function getCoveredYears() {
  return [...data.years];
}

/** Whether the data covers this day's year. Outside it, nothing is known. */
export function isCovered(date) {
  return data.years.includes(date.getFullYear());
}

/** Every listed holiday in a year, including those for some people or areas only. */
export function getHolidays(year) {
  return data.holidays.filter((h) => h.date.startsWith(`${year}-`)).map(shape);
}

/** Holidays in a year on which banks are closed. */
export function getBankHolidays(year) {
  return getHolidays(year).filter((h) => h.bankHoliday);
}

/** The holiday on this day, if any. */
export function getHoliday(date) {
  const h = byDate.get(isoDay(date));
  return h ? shape(h) : undefined;
}

export function isHoliday(date) {
  return byDate.has(isoDay(date));
}

export function isBankHoliday(date) {
  return byDate.get(isoDay(date))?.banksClosed === true;
}

export function isWeekend(date) {
  return data.weekend.includes(DAY_NAMES[date.getDay()]);
}

/** A day banks are open: not the weekend, not a bank holiday. */
export function isBankingDay(date) {
  return !isWeekend(date) && !isBankHoliday(date);
}

/** Moves by whole banking days, skipping weekends and bank holidays. Negative goes back. */
export function addBankingDays(date, amount) {
  if (!Number.isInteger(amount)) throw new TypeError("amount must be an integer");
  const step = amount < 0 ? -1 : 1;
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let left = Math.abs(amount);
  while (left > 0) {
    result.setDate(result.getDate() + step);
    if (isBankingDay(result)) left--;
  }
  return result;
}

/** The next banking day after this one. */
export function nextBankingDay(date) {
  return addBankingDays(date, 1);
}
