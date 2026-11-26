// The one definition of a holiday row, shared by the build and the admin CLI.

export const COLUMNS = ["date", "name", "name_ne", "banks_closed", "applies_to", "source", "note"];
export const REQUIRED = ["date", "name", "banks_closed"];

// RFC 4180-style CSV: quoted fields may hold commas, quotes ("") and newlines.
export function parseCSV(text) {
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

/** Rows as objects keyed by lowercased header. */
export function readRows(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((cells) => Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()])));
  return { header, records };
}

function quote(value) {
  const v = String(value ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Writes records with every column, sorted by date. */
export function writeRows(records) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  return [COLUMNS.join(","), ...sorted.map((r) => COLUMNS.map((c) => quote(r[c])).join(","))].join("\n") + "\n";
}

export function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const TEXT_LIMITS = { name: 100, name_ne: 100, applies_to: 100, source: 500, note: 300 };

/** Problems with one row, as human-readable strings; empty when it is valid. */
export function rowProblems(r) {
  const problems = [];
  if (!realDate(r.date ?? "")) problems.push(`date "${r.date ?? ""}" is not a real YYYY-MM-DD date`);
  if (!r.name) problems.push("name is required");
  const closed = (r.banks_closed ?? "").toLowerCase();
  if (closed !== "yes" && closed !== "no") problems.push(`banks_closed must be yes or no, not "${r.banks_closed ?? ""}"`);
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    const v = r[field] ?? "";
    if (v.length > max) problems.push(`${field} is longer than ${max} characters`);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(v)) problems.push(`${field} contains control characters`);
  }
  // A leading =, +, - or @ makes spreadsheets run the cell as a formula.
  for (const field of ["name", "name_ne", "applies_to", "note"]) {
    if (/^[=+\-@]/.test(r[field] ?? "")) problems.push(`${field} may not start with = + - or @`);
  }
  if (r.source && !/^https?:\/\/\S+$/.test(r.source)) problems.push("source must be an http(s) link");
  return problems;
}
