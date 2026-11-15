#!/usr/bin/env node
// Verifies that every place that states the release version agrees, and that
// CHANGELOG.md has an entry for it. Run by CI; exits non-zero on mismatch.
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

const pkg = JSON.parse(await read("package.json"));
const lock = JSON.parse(await read("package-lock.json"));
const server = await read("src/server.ts");
const smoke = await read("scripts/live-smoke.ts");
const changelog = await read("CHANGELOG.md");

const version = pkg.version;
const found = {
  "package.json": version,
  "package-lock.json": lock.version,
  'package-lock.json packages[""]': lock.packages?.[""]?.version,
  "src/server.ts": server.match(/new McpServer\(\{[^}]*version:\s*"([^"]+)"/)?.[1],
  "scripts/live-smoke.ts": smoke.match(/new Client\(\{[^}]*version:\s*"([^"]+)"/)?.[1],
};

const problems = Object.entries(found)
  .filter(([, value]) => value !== version)
  .map(([where, value]) => `${where} has ${value ?? "no version"}, expected ${version}`);

const escaped = version.replace(/\./g, "\\.");
if (!new RegExp(`^## \\[${escaped}\\]`, "m").test(changelog)) {
  problems.push(`CHANGELOG.md has no "## [${version}]" entry`);
}

if (problems.length > 0) {
  console.error(`Version check failed for ${version}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Version ${version} is consistent and has a changelog entry.`);
