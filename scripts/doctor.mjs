#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const knownArgs = new Set(["--json", "--live", "--help"]);
const unknown = [...args].filter((argument) => !knownArgs.has(argument));

if (args.has("--help")) {
  console.log("Usage: npm run doctor -- [--live] [--json]");
  console.log("  --live  Validate configured tokens against UAB Moodle");
  console.log("  --json  Emit share-safe machine-readable output");
  process.exit(0);
}
if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);

const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
const tokenFile = process.env.UAB_TOKEN_FILE?.trim()
  ? path.resolve(process.env.UAB_TOKEN_FILE.trim())
  : path.join(root, "data", "tokens.json");

function validYear(year) {
  return /^\d{4}-\d{2}$/.test(year);
}

function validateTokens(parsed) {
  if (!parsed || typeof parsed !== "object" || !parsed.years || typeof parsed.years !== "object") {
    throw new Error("missing years object");
  }
  const years = Object.entries(parsed.years);
  if (!years.length) throw new Error("no academic years configured");
  for (const [year, entry] of years) {
    if (!validYear(year) || !entry || typeof entry !== "object") throw new Error("invalid year entry");
    const url = new URL(entry.baseUrl);
    if (url.protocol !== "https:" || url.hostname !== "e-aules.uab.cat") {
      throw new Error("unexpected Moodle origin");
    }
    if (typeof entry.token !== "string" || entry.token.length < 8) throw new Error("missing token");
  }
  return Object.fromEntries(years.sort(([left], [right]) => left.localeCompare(right)));
}

function classifyLiveError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/invalidtoken|token.*(expired|invalid)|access control exception|not logged/.test(message)) {
    return "authentication failed";
  }
  if (/timeout|timed out|fetch failed|enotfound|econnrefused|network/.test(message)) {
    return "UAB Moodle is unreachable";
  }
  return "UAB Moodle returned an error";
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
add(
  "node_runtime",
  nodeMajor >= 20 ? "ok" : "error",
  nodeMajor >= 20 ? `Node.js ${process.versions.node}` : "Node.js 20 or newer is required",
);

let configuredYears;
let tokenStat;
try {
  const [contents, stat] = await Promise.all([fs.readFile(tokenFile, "utf8"), fs.stat(tokenFile)]);
  configuredYears = validateTokens(JSON.parse(contents));
  tokenStat = stat;
  add("token_file", "ok", `${Object.keys(configuredYears).length} academic year(s) configured`);
} catch {
  add("token_file", "error", "Missing or invalid token file; run npm run auth");
}

if (tokenStat && process.platform !== "win32") {
  const exposed = tokenStat.mode & 0o077;
  add(
    "token_permissions",
    exposed === 0 ? "ok" : "warning",
    exposed === 0 ? "Token file is owner-only" : "Token file is readable beyond its owner; run chmod 600",
  );
} else if (tokenStat) {
  add("token_permissions", "ok", "Token file exists; use Windows ACLs to keep it private");
}

const browserExecutable = process.env.UAB_BROWSER_EXECUTABLE?.trim();
const browserChannel = process.env.UAB_BROWSER_CHANNEL?.trim();
if (browserExecutable) {
  try {
    await fs.access(browserExecutable);
    add("browser", "ok", "Configured browser executable exists");
  } catch {
    add("browser", "warning", "Configured browser executable was not found");
  }
} else if (browserChannel) {
  add("browser", "ok", `Browser channel '${browserChannel}' is configured`);
} else if (nodeMajor >= 20) {
  try {
    const { chromium } = await import("playwright");
    await fs.access(chromium.executablePath());
    add("browser", "ok", "Playwright Chromium is installed");
  } catch {
    add("browser", "warning", "No browser detected; run npx playwright install chromium before authentication renewal");
  }
} else {
  add("browser", "warning", "Browser detection skipped until Node.js is upgraded");
}

try {
  await fs.access(path.join(root, "dist", "index.js"));
  add("build", "ok", "Compiled stdio server is present");
} catch {
  add("build", "warning", "Compiled server is absent; run npm run build");
}

const httpToken = process.env.MCP_HTTP_TOKEN?.trim() || "";
if (!httpToken) {
  add("http_transport", "ok", "Not configured (optional for local stdio)");
} else if (httpToken.length < 32 || httpToken.startsWith("replace-with-")) {
  add("http_transport", "error", "MCP_HTTP_TOKEN must be a non-placeholder secret of at least 32 characters");
} else {
  const host = process.env.MCP_HOST?.trim() || "127.0.0.1";
  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]")
    .split(",").map((value) => value.trim()).filter(Boolean);
  add(
    "http_transport",
    host === "0.0.0.0" || host === "::" ? "warning" : "ok",
    host === "0.0.0.0" || host === "::"
      ? `Listening on all interfaces with ${allowedHosts.length} allowed host(s); verify the firewall and proxy`
      : `Bearer authentication configured with ${allowedHosts.length} allowed host(s)`,
  );
}

if (args.has("--live") && configuredYears) {
  const timeout = Number(process.env.UAB_REQUEST_TIMEOUT_MS || "30000");
  for (const [year, config] of Object.entries(configuredYears)) {
    const body = new URLSearchParams({
      wstoken: config.token,
      wsfunction: "core_webservice_get_site_info",
      moodlewsrestformat: "json",
    });
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/webservice/rest/server.php`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(Number.isFinite(timeout) ? timeout : 30_000),
      });
      const result = await response.json();
      if (!response.ok || result.exception || result.errorcode) {
        throw new Error(result.errorcode || `HTTP ${response.status}`);
      }
      add(`live_${year}`, "ok", "Authentication accepted by UAB Moodle");
    } catch (error) {
      add(`live_${year}`, "error", classifyLiveError(error));
    }
  }
}

const report = {
  ok: checks.every(({ status }) => status !== "error"),
  live: args.has("--live"),
  checks,
};

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("UAB Campus MCP doctor\n");
  for (const check of checks) {
    const label = check.status === "ok" ? "OK" : check.status === "warning" ? "WARN" : "ERROR";
    console.log(`[${label}] ${check.name}: ${check.detail}`);
  }
  console.log(`\nResult: ${report.ok ? "ready" : "needs attention"}`);
}

process.exitCode = report.ok ? 0 : 1;
