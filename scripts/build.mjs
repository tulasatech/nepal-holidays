// Validates data/*.csv and data/meta.json, then writes the published JSON to
// site/. With --check it validates only. No dependencies, so it runs anywhere
// Node does.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMNS, REQUIRED, readRows, rowProblems } from "./csv.mjs";

const root = new URL("..", import.meta.url).pathname;
const dataDir = join(root, "data");
const siteDir = join(root, "site");
const checkOnly = process.argv.includes("--check");

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

// meta.json: who publishes the list, and the weekly weekend banks keep.
const metaPath = join(dataDir, "meta.json");
let meta;
try {
  meta = JSON.parse(readFileSync(metaPath, "utf8"));
} catch (e) {
  fail("data/meta.json", `unreadable: ${e.message}`);
  meta = {};
}
if (!Array.isArray(meta.weekend) || meta.weekend.some((d) => !DAYS.includes(String(d).toLowerCase()))) {
  fail("data/meta.json", `"weekend" must be a list of day names, e.g. ["saturday"]`);
}

const years = [];
for (const file of readdirSync(dataDir).filter((f) => /^\d{4}\.csv$/.test(f)).sort()) {
  const year = Number(file.slice(0, 4));
  const where = `data/${file}`;
  const { header, records } = readRows(readFileSync(join(dataDir, file), "utf8"));
  if (header.length === 0) { fail(where, "empty"); continue; }
  const unknown = header.filter((h) => !COLUMNS.includes(h));
  if (unknown.length) fail(where, `unknown columns: ${unknown.join(", ")}`);
  for (const col of REQUIRED) if (!header.includes(col)) fail(where, `missing column "${col}"`);

  const seen = new Map();
  const holidays = [];
  records.forEach((r, i) => {
    const line = `${where}:${i + 2}`;
    const problems = rowProblems(r);
    problems.forEach((p) => fail(line, p));
    if (problems.length) return;
    if (Number(r.date.slice(0, 4)) !== year) fail(line, `${r.date} is not in ${year}`);
    // One row per day: a day with two occasions lists them in one name.
    if (seen.has(r.date)) fail(line, `${r.date} is already on line ${seen.get(r.date)}`);
    seen.set(r.date, i + 2);
    holidays.push({
      date: r.date,
      name: r.name,
      ...(r.name_ne ? { nameNe: r.name_ne } : {}),
      banksClosed: r.banks_closed.toLowerCase() === "yes",
      ...(r.applies_to ? { appliesTo: r.applies_to } : {}),
      ...(r.source ? { source: r.source } : {}),
      ...(r.note ? { note: r.note } : {}),
    });
  });
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  years.push({ year, holidays });
}

if (errors.length) {
  console.error(`${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}

console.log(`ok: ${years.map((y) => `${y.year} (${y.holidays.length} days)`).join(", ") || "no years yet"}`);
if (checkOnly) process.exit(0);

const weekend = meta.weekend.map((d) => d.toLowerCase());
const common = { country: "NP", source: meta.source ?? null, weekend };
mkdirSync(join(siteDir, "holidays"), { recursive: true });
for (const { year, holidays } of years) {
  writeFileSync(join(siteDir, "holidays", `${year}.json`), JSON.stringify({ ...common, year, holidays }, null, 2) + "\n");
}
writeFileSync(
  join(siteDir, "holidays", "index.json"),
  JSON.stringify({
    ...common,
    years: years.map((y) => y.year),
    updated: new Date().toISOString(),
    // Every year's holidays in one list, so a single fetch has them all.
    holidays: years.flatMap((y) => y.holidays),
  }, null, 2) + "\n",
);
copyFileSync(join(root, "schema", "holiday-year.schema.json"), join(siteDir, "holiday-year.schema.json"));
copyFileSync(join(root, "site-src", "index.html"), join(siteDir, "index.html"));
writeFileSync(join(siteDir, ".nojekyll"), "");
console.log(`wrote ${siteDir}`);
