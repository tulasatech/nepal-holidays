#!/usr/bin/env node
// Admin CLI for reports on the holiday list. Reports are GitHub issues
// labelled holiday-report: a holiday that is missing, or a listed day that is
// a working day. Approving applies them to data/<year>.csv, commits, pushes,
// and closes the issues.
//
//   node scripts/holidays.mjs list
//   node scripts/holidays.mjs show 12
//   node scripts/holidays.mjs approve 12 15 [--replace] [--no-push]
//   node scripts/holidays.mjs approve --all [--replace] [--no-push]
//   node scripts/holidays.mjs reject 13 --reason "Not in the notice"
//
// Needs git and the GitHub CLI (gh), signed in with write access to the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRows, realDate, rowProblems, writeRows } from "./csv.mjs";

const root = new URL("..", import.meta.url).pathname;
const LABEL = "holiday-report";
const MISSING = "missing";
const WORKING = "working";
const FIELDS = { Report: "report", Date: "date", Name: "name", "Name in Nepali": "name_ne", "Banks closed": "banks_closed", "Applies to": "applies_to", Source: "source", Note: "note" };

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (...args) => run("gh", args);
const git = (...args) => run("git", args);

function die(message) {
  console.error(message);
  process.exit(1);
}

// Issue forms render each field as "### Label" followed by its value. The
// report kind also rides in the title, for links that can't preset the
// dropdown.
function parseIssue(issue) {
  const fields = {};
  for (const section of issue.body.split(/^### /m).slice(1)) {
    const [label, ...rest] = section.split("\n");
    const key = FIELDS[label.trim()];
    if (!key) continue;
    const value = rest.join(" ").replace(/\s+/g, " ").trim();
    fields[key] = value === "_No response_" ? "" : value;
  }
  const report = `${fields.report ?? ""} ${issue.title}`.toLowerCase();
  fields.kind = report.includes("working day") ? WORKING : report.includes("missing") ? MISSING : "";
  fields.banks_closed = (fields.banks_closed ?? "").toLowerCase();
  return fields;
}

function openReports() {
  const issues = JSON.parse(gh("issue", "list", "--label", LABEL, "--state", "open", "--limit", "200", "--json", "number,title,body,author,createdAt"));
  return issues.map((issue) => ({ ...issue, fields: parseIssue(issue) }));
}

function getReport(number) {
  const issue = JSON.parse(gh("issue", "view", String(number), "--json", "number,title,body,author,createdAt,state,labels"));
  if (!issue.labels.some((l) => l.name === LABEL)) die(`#${number} is not a holiday report`);
  if (issue.state !== "OPEN") die(`#${number} is already closed`);
  return { ...issue, fields: parseIssue(issue) };
}

const yearFile = (year) => join(root, "data", `${year}.csv`);

function existingRecords(year) {
  const file = yearFile(year);
  return existsSync(file) ? readRows(readFileSync(file, "utf8")).records : [];
}

/** What approving would do, or why it can't. */
function assess(r, { replace }) {
  const f = r.fields;
  const problems = [];
  if (!f.source) problems.push("source is required");
  else if (!/^https?:\/\/\S+$/.test(f.source)) problems.push("source must be an http(s) link");
  if (!f.kind) problems.push("can't tell whether this reports a missing holiday or a working day");

  if (f.kind === WORKING) {
    if (!realDate(f.date ?? "")) problems.push(`date "${f.date ?? ""}" is not a real YYYY-MM-DD date`);
    if (problems.length) return { ok: false, problems };
    const listed = existingRecords(f.date.slice(0, 4)).find((h) => h.date === f.date);
    if (!listed) return { ok: false, problems: [`${f.date} is not listed, so there is nothing to remove`] };
    return { ok: true, year: f.date.slice(0, 4), removes: listed };
  }

  problems.push(...rowProblems(f));
  if (problems.length) return { ok: false, problems };
  const year = f.date.slice(0, 4);
  const listed = existingRecords(year).find((h) => h.date === f.date);
  if (listed && !replace) return { ok: false, problems: [`${f.date} is already listed as "${listed.name}"; use --replace to overwrite it`] };
  return { ok: true, year, replaces: listed };
}

function describe(r) {
  const f = r.fields;
  if (f.kind === WORKING) return `${f.date} is a working day${f.name ? ` (listed as ${f.name})` : ""}`;
  if (!f.kind) return `${f.date || "no date"}: unclear report "${r.title}"`;
  const bits = [`${f.date} missing:`, f.name, f.name_ne && `(${f.name_ne})`, `banks ${f.banks_closed === "yes" ? "closed" : "open"}`, f.applies_to && `— ${f.applies_to}`];
  return bits.filter(Boolean).join(" ");
}

function verdictLine(v) {
  if (!v.ok) return `cannot approve: ${v.problems.join("; ")}`;
  if (v.removes) return `ready: removes "${v.removes.name}"`;
  return v.replaces ? `ready: replaces "${v.replaces.name}"` : "ready: adds it";
}

function list() {
  const reports = openReports();
  if (!reports.length) return console.log("No open reports.");
  const byDate = new Map();
  for (const r of reports) byDate.set(r.fields.date, (byDate.get(r.fields.date) ?? 0) + 1);
  for (const r of reports) {
    const clash = byDate.get(r.fields.date) > 1 ? "  [another open report has this date]" : "";
    console.log(`#${r.number}  ${describe(r)}  by @${r.author.login}${clash}`);
    console.log(`      ${verdictLine(assess(r, { replace: false }))}`);
    if (r.fields.source) console.log(`      source: ${r.fields.source}`);
  }
}

function show(number) {
  const r = getReport(number);
  console.log(`#${r.number} by @${r.author.login} on ${r.createdAt.slice(0, 10)}: ${r.title}`);
  for (const [label, key] of Object.entries(FIELDS)) console.log(`  ${label.padEnd(15)} ${r.fields[key] || "—"}`);
  console.log(`  ${verdictLine(assess(r, { replace: false }))}`);
}

function ensureCleanMain() {
  if (git("status", "--porcelain")) die("Commit or stash your local changes first.");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") die("Switch to the main branch first.");
  git("pull", "--ff-only", "--quiet");
}

function approve(numbers, { all, replace, push }) {
  ensureCleanMain();
  const reports = all ? openReports() : numbers.map(getReport);
  if (!reports.length) return console.log("No open reports.");

  // Two reports about one day need a person to decide, so neither is applied.
  const counts = new Map();
  for (const r of reports) counts.set(r.fields.date, (counts.get(r.fields.date) ?? 0) + 1);

  const accepted = [];
  for (const r of reports) {
    if (counts.get(r.fields.date) > 1) {
      console.log(`#${r.number} skipped: another report in this batch is about the same day; approve one of them on its own`);
      continue;
    }
    const verdict = assess(r, { replace });
    if (!verdict.ok) {
      console.log(`#${r.number} skipped: ${verdict.problems.join("; ")}`);
      continue;
    }
    accepted.push({ ...r, year: verdict.year });
  }
  if (!accepted.length) die("Nothing to approve.");

  for (const year of new Set(accepted.map((r) => r.year))) {
    let records = existingRecords(year);
    for (const r of accepted.filter((a) => a.year === year)) {
      if (r.fields.kind === WORKING) {
        records = records.filter((h) => h.date !== r.fields.date);
        continue;
      }
      const at = records.findIndex((h) => h.date === r.fields.date);
      if (at >= 0) records[at] = r.fields;
      else records.push(r.fields);
    }
    writeFileSync(yearFile(year), writeRows(records));
  }
  try {
    execFileSync("node", ["scripts/build.mjs", "--check"], { cwd: root, stdio: "inherit" });
  } catch {
    git("checkout", "--", "data");
    die("The data did not pass validation; nothing was committed.");
  }

  const refs = accepted.map((r) => `#${r.number}`).join(", ");
  const summary = accepted.map((r) => `- ${describe(r)} (#${r.number}, ${r.fields.source})`).join("\n");
  git("add", "data");
  git("commit", "--quiet", "-m", `Apply holiday reports ${refs}`, "-m", summary);
  const sha = git("rev-parse", "HEAD");
  if (push) git("push", "--quiet");
  const repo = gh("repo", "view", "--json", "url", "--jq", ".url");
  for (const r of accepted) {
    const what = r.fields.kind === WORKING ? "Removed" : "Added";
    gh("issue", "close", String(r.number), "--comment", `${what} in ${repo}/commit/${sha}. Thank you!`);
  }
  console.log(`Approved ${refs}${push ? " and published" : " (committed; run git push to publish)"}.`);
}

function reject(number, reason) {
  if (!reason) die('Give a reason: --reason "..."');
  getReport(number);
  gh("issue", "close", String(number), "--reason", "not planned", "--comment", `Not applied: ${reason}`);
  console.log(`Rejected #${number}.`);
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const reasonAt = rest.indexOf("--reason");
const numbers = rest.filter((a, i) => (reasonAt < 0 || i !== reasonAt + 1) && /^#?\d+$/.test(a)).map((a) => Number(a.replace("#", "")));

switch (command) {
  case "list":
    list();
    break;
  case "show":
    if (numbers.length !== 1) die("Usage: holidays.mjs show <issue>");
    show(numbers[0]);
    break;
  case "approve":
    if (!flags.has("--all") && !numbers.length) die("Usage: holidays.mjs approve <issue>... | --all");
    if (flags.has("--all") && numbers.length) die("Use either issue numbers or --all, not both.");
    approve(numbers, { all: flags.has("--all"), replace: flags.has("--replace"), push: !flags.has("--no-push") });
    break;
  case "reject":
    if (numbers.length !== 1) die('Usage: holidays.mjs reject <issue> --reason "..."');
    reject(numbers[0], reasonAt >= 0 ? rest[reasonAt + 1] : "");
    break;
  default:
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 14).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
