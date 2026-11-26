// Validates data/*.csv and data/meta.json, then writes the published JSON to
// site/. With --check it validates only. No dependencies, so it runs anywhere
// Node does.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dataDir = join(root, "data");
const siteDir = join(root, "site");
const checkOnly = process.argv.includes("--check");

const COLUMNS = ["date", "name", "name_ne", "banks_closed", "applies_to", "note"];
const REQUIRED = ["date", "name", "banks_closed"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

// RFC 4180-style CSV: quoted fields may hold commas, quotes ("") and newlines.
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

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
  const rows = parseCSV(readFileSync(join(dataDir, file), "utf8"));
  if (rows.length === 0) { fail(where, "empty"); continue; }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => !COLUMNS.includes(h));
  if (unknown.length) fail(where, `unknown columns: ${unknown.join(", ")}`);
  for (const col of REQUIRED) if (!header.includes(col)) fail(where, `missing column "${col}"`);

  const seen = new Map();
  const holidays = [];
  rows.slice(1).forEach((cells, i) => {
    const line = `${where}:${i + 2}`;
    const r = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
    if (!realDate(r.date)) return fail(line, `date "${r.date}" is not a real YYYY-MM-DD date`);
    if (Number(r.date.slice(0, 4)) !== year) fail(line, `${r.date} is not in ${year}`);
    if (!r.name) fail(line, "name is required");
    const closed = r.banks_closed.toLowerCase();
    if (closed !== "yes" && closed !== "no") fail(line, `banks_closed must be yes or no, not "${r.banks_closed}"`);
    // One row per day: a day with two occasions lists them in one name.
    if (seen.has(r.date)) fail(line, `${r.date} is already on line ${seen.get(r.date)}`);
    seen.set(r.date, i + 2);
    holidays.push({
      date: r.date,
      name: r.name,
      ...(r.name_ne ? { nameNe: r.name_ne } : {}),
      banksClosed: closed === "yes",
      ...(r.applies_to ? { appliesTo: r.applies_to } : {}),
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
  JSON.stringify({ ...common, years: years.map((y) => y.year), updated: new Date().toISOString() }, null, 2) + "\n",
);
copyFileSync(join(root, "schema", "holiday-year.schema.json"), join(siteDir, "holiday-year.schema.json"));
writeFileSync(join(siteDir, ".nojekyll"), "");
console.log(`wrote ${siteDir}`);
