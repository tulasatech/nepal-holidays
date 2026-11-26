#!/usr/bin/env node
// Admin CLI for holiday suggestions. Suggestions are GitHub issues labelled
// holiday-suggestion, opened from the site or the issue form. Approving one
// adds it to data/<year>.csv, commits, pushes, and closes the issue.
//
//   node scripts/holidays.mjs list
//   node scripts/holidays.mjs show 12
//   node scripts/holidays.mjs approve 12 15 [--replace] [--no-push]
//   node scripts/holidays.mjs approve --all [--replace] [--no-push]
//   node scripts/holidays.mjs reject 13 --reason "No such holiday in the notice"
//
// Needs git and the GitHub CLI (gh), signed in with write access to the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRows, rowProblems, writeRows } from "./csv.mjs";

const root = new URL("..", import.meta.url).pathname;
const LABEL = "holiday-suggestion";
const FIELDS = { Date: "date", Name: "name", "Name in Nepali": "name_ne", "Banks closed": "banks_closed", "Applies to": "applies_to", Source: "source", Note: "note" };

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const gh = (...args) => run("gh", args);
const git = (...args) => run("git", args);

function die(message) {
  console.error(message);
  process.exit(1);
}

// Issue forms render each field as "### Label" followed by its value.
function parseIssue(issue) {
  const fields = {};
  const sections = issue.body.split(/^### /m).slice(1);
  for (const section of sections) {
    const [label, ...rest] = section.split("\n");
    const key = FIELDS[label.trim()];
    if (!key) continue;
    const value = rest.join(" ").replace(/\s+/g, " ").trim();
    fields[key] = value === "_No response_" ? "" : value;
  }
  fields.banks_closed = (fields.banks_closed ?? "").toLowerCase();
  return fields;
}

function openSuggestions() {
  const issues = JSON.parse(gh("issue", "list", "--label", LABEL, "--state", "open", "--limit", "200", "--json", "number,title,body,author,createdAt"));
  return issues.map((issue) => ({ ...issue, fields: parseIssue(issue) }));
}

function getSuggestion(number) {
  const issue = JSON.parse(gh("issue", "view", String(number), "--json", "number,title,body,author,createdAt,state,labels"));
  if (!issue.labels.some((l) => l.name === LABEL)) die(`#${number} is not a holiday suggestion`);
  if (issue.state !== "OPEN") die(`#${number} is already closed`);
  return { ...issue, fields: parseIssue(issue) };
}

function yearFile(year) {
  return join(root, "data", `${year}.csv`);
}

function existingRecords(year) {
  const file = yearFile(year);
  return existsSync(file) ? readRows(readFileSync(file, "utf8")).records : [];
}

/** What approving would do, or why it can't. */
function assess(s, { replace }) {
  const problems = rowProblems(s.fields);
  if (!s.fields.source) problems.push("source is required");
  if (problems.length) return { ok: false, problems };
  const year = s.fields.date.slice(0, 4);
  const current = existingRecords(year).find((r) => r.date === s.fields.date);
  if (current && !replace) return { ok: false, problems: [`${s.fields.date} is already listed as "${current.name}"; use --replace to overwrite it`] };
  return { ok: true, year, replaces: current };
}

function describe(s) {
  const f = s.fields;
  const bits = [f.date, f.name, f.name_ne && `(${f.name_ne})`, `banks ${f.banks_closed === "yes" ? "closed" : "open"}`, f.applies_to && `— ${f.applies_to}`].filter(Boolean);
  return bits.join(" ");
}

function list() {
  const suggestions = openSuggestions();
  if (!suggestions.length) return console.log("No open suggestions.");
  const byDate = new Map();
  for (const s of suggestions) byDate.set(s.fields.date, (byDate.get(s.fields.date) ?? 0) + 1);
  for (const s of suggestions) {
    const verdict = assess(s, { replace: false });
    const clash = byDate.get(s.fields.date) > 1 ? "  [another open suggestion has this date]" : "";
    console.log(`#${s.number}  ${describe(s)}  by @${s.author.login}${clash}`);
    console.log(verdict.ok ? `      ready${verdict.replaces ? " (replaces an existing entry)" : ""}` : `      cannot approve: ${verdict.problems.join("; ")}`);
    if (s.fields.source) console.log(`      source: ${s.fields.source}`);
  }
}

function show(number) {
  const s = getSuggestion(number);
  console.log(`#${s.number} by @${s.author.login} on ${s.createdAt.slice(0, 10)}`);
  for (const [label, key] of Object.entries(FIELDS)) console.log(`  ${label.padEnd(15)} ${s.fields[key] || "—"}`);
  const verdict = assess(s, { replace: false });
  console.log(verdict.ok ? "  ready to approve" : `  cannot approve: ${verdict.problems.join("; ")}`);
}

function ensureCleanMain() {
  if (git("status", "--porcelain")) die("Commit or stash your local changes first.");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") die("Switch to the main branch first.");
  git("pull", "--ff-only", "--quiet");
}

function approve(numbers, { all, replace, push }) {
  ensureCleanMain();
  const suggestions = all ? openSuggestions() : numbers.map(getSuggestion);
  if (!suggestions.length) return console.log("No open suggestions.");

  // Two suggestions for one date need a person to pick, so neither goes in.
  const counts = new Map();
  for (const s of suggestions) counts.set(s.fields.date, (counts.get(s.fields.date) ?? 0) + 1);

  const accepted = [];
  for (const s of suggestions) {
    if (counts.get(s.fields.date) > 1) {
      console.log(`#${s.number} skipped: another suggestion in this batch has the same date; approve one of them on its own`);
      continue;
    }
    const verdict = assess(s, { replace });
    if (!verdict.ok) {
      console.log(`#${s.number} skipped: ${verdict.problems.join("; ")}`);
      continue;
    }
    accepted.push({ ...s, year: verdict.year });
  }
  if (!accepted.length) die("Nothing to approve.");

  const years = new Set(accepted.map((s) => s.year));
  for (const year of years) {
    const records = existingRecords(year);
    for (const s of accepted.filter((a) => a.year === year)) {
      const row = s.fields;
      const at = records.findIndex((r) => r.date === row.date);
      if (at >= 0) records[at] = row;
      else records.push(row);
    }
    writeFileSync(yearFile(year), writeRows(records));
  }
  try {
    execFileSync("node", ["scripts/build.mjs", "--check"], { cwd: root, stdio: "inherit" });
  } catch {
    git("checkout", "--", "data");
    die("The data did not pass validation; nothing was committed.");
  }

  const refs = accepted.map((s) => `#${s.number}`).join(", ");
  const summary = accepted.map((s) => `- ${describe(s)} (#${s.number}, ${s.fields.source})`).join("\n");
  git("add", "data");
  git("commit", "--quiet", "-m", `Add holidays from suggestions ${refs}`, "-m", summary);
  const sha = git("rev-parse", "HEAD");
  if (push) git("push", "--quiet");
  const repo = gh("repo", "view", "--json", "url", "--jq", ".url");
  for (const s of accepted) {
    gh("issue", "close", String(s.number), "--comment", `Added in ${repo}/commit/${sha}. Thank you!`);
  }
  console.log(`Approved ${refs}${push ? " and published" : " (committed; run git push to publish)"}.`);
}

function reject(number, reason) {
  if (!reason) die('Give a reason: --reason "..."');
  getSuggestion(number);
  gh("issue", "close", String(number), "--reason", "not planned", "--comment", `Not added: ${reason}`);
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
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
