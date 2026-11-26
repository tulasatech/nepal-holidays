// Builds the npm package date-fns-holiday-np in package/dist from the feed
// that scripts/build.mjs has just validated and written to site/, so the
// package and the published JSON always carry the same data.
//
//   node scripts/build.mjs && node scripts/build-package.mjs [version]
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "package", "src");
const dist = join(root, "package", "dist");
const version = process.argv[2] ?? "0.0.0-local";

let feed;
try {
  feed = JSON.parse(readFileSync(join(root, "site", "holidays", "index.json"), "utf8"));
} catch {
  console.error("Run node scripts/build.mjs first: it validates the data and writes site/holidays/index.json.");
  process.exit(1);
}

const data = {
  source: feed.source,
  updated: feed.updated,
  weekend: feed.weekend,
  years: feed.years,
  holidays: feed.holidays.map(({ date, name, nameNe, banksClosed, appliesTo }) => ({
    date, name, ...(nameNe ? { nameNe } : {}), banksClosed, ...(appliesTo ? { appliesTo } : {}),
  })),
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(src, "index.js"), join(dist, "index.js"));
copyFileSync(join(src, "index.d.ts"), join(dist, "index.d.ts"));
writeFileSync(join(dist, "data.js"), `// Generated from github.com/tulasatech/nepal-holidays. Do not edit.\nexport const data = ${JSON.stringify(data, null, 2)};\n`);
copyFileSync(join(root, "package", "README.md"), join(dist, "README.md"));
copyFileSync(join(root, "LICENSE"), join(dist, "LICENSE"));
writeFileSync(join(dist, "package.json"), JSON.stringify({
  name: "date-fns-holiday-np",
  version,
  description: "Nepal public and bank holidays, in the shape of date-fns-holiday-us.",
  type: "module",
  main: "./index.js",
  types: "./index.d.ts",
  exports: { ".": { types: "./index.d.ts", import: "./index.js", default: "./index.js" } },
  sideEffects: false,
  files: ["index.js", "index.d.ts", "data.js", "README.md", "LICENSE"],
  keywords: ["nepal", "holidays", "bank holidays", "date-fns", "bikram sambat"],
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/tulasatech/nepal-holidays.git" },
  homepage: "https://tulasatech.github.io/nepal-holidays/",
}, null, 2) + "\n");
console.log(`package/dist: date-fns-holiday-np@${version}, ${data.holidays.length} holidays (${data.years.join(", ")})`);
