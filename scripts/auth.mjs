import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const profileDir = path.join(dataDir, "browser-profile");
const tokensPath = path.join(dataDir, "tokens.json");
const campusUrl = "https://cv.uab.cat/";
const timeoutMs = 15 * 60 * 1000;
const portalPages = ["index.jsp", "anysAnteriors.jsp", "dosAnysAnteriors.jsp"]
  .map((page) => `https://cv.uab.cat/protected/${page}`);
const requestedYears = process.argv.slice(2);
if (requestedYears.some((year) => !/^\d{4}-\d{2}$/.test(year))) {
  throw new Error("Academic years must look like 2026-27");
}

function browserOptions() {
  const executablePath = process.env.UAB_BROWSER_EXECUTABLE?.trim();
  const channel = process.env.UAB_BROWSER_CHANNEL?.trim();
  return {
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    ...(channel ? { channel } : {}),
    viewport: { width: 1440, height: 900 },
  };
}

async function portalAuthenticated(page) {
  const url = page.url();
  return /cv\.uab\.cat\/protected\//.test(url)
    && await page.locator('input[type="password"]').count() === 0;
}

async function moodleAuthenticated(page) {
  if (!/e-aules\.uab\.cat/.test(page.url())) return false;
  return !(await page.evaluate(() => document.body.classList.contains("notloggedin")));
}

async function waitForPortal(context) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = context.pages().at(-1);
    if (page && await portalAuthenticated(page).catch(() => false)) return page;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for UAB login");
}

async function collectYears(page) {
  const years = new Set();
  for (const url of portalPages) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const hrefs = await page.locator('a[href*="e-aules.uab.cat"]').evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") || ""));
      for (const href of hrefs) {
        const match = href.match(/e-aules\.uab\.cat\/(\d{4}-\d{2})\//);
        if (match?.[1]) years.add(match[1]);
      }
    } catch {
      // Some historical portal pages may not be available to every account.
    }
  }
  return [...years].sort();
}

function decodeMobileToken(location, baseUrl, passport) {
  const encoded = location.match(/(?:[?&]|\/\/)token=([^&]+)/)?.[1];
  if (!encoded) throw new Error("Moodle returned no mobile token");
  const decoded = Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8");
  const [siteId, token, privateToken] = decoded.split(":::");
  const expectedSiteId = crypto.createHash("md5").update(`${baseUrl}${passport}`).digest("hex");
  if (!token || siteId !== expectedSiteId) throw new Error("Moodle returned an invalid token payload");
  return { token, ...(privateToken ? { privateToken } : {}) };
}

async function readExistingTokens() {
  try {
    return JSON.parse(await fs.readFile(tokensPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, years: {} };
    throw error;
  }
}

await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(profileDir, browserOptions());
const firstPage = context.pages()[0] ?? await context.newPage();

try {
  console.log("Opening the official UAB Campus Virtual login.");
  console.log("Sign in yourself and complete MFA. This tool never reads your password.");
  await firstPage.goto(campusUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const page = await waitForPortal(context);
  const years = requestedYears.length ? requestedYears : await collectYears(page);
  if (!years.length) throw new Error("No UAB Moodle academic years were found for this account");

  const saved = await readExistingTokens();
  saved.years ||= {};
  const refreshed = [];
  for (const year of years) {
    try {
      const baseUrl = `https://e-aules.uab.cat/${year}`;
      await page.goto(`${baseUrl}/login/index.php?authCAS=CAS`, {
        waitUntil: "networkidle",
        timeout: 90_000,
      });
      if (!(await moodleAuthenticated(page))) {
        throw new Error("Moodle login did not complete");
      }

      const passport = crypto.randomBytes(24).toString("hex");
      const launchUrl = `${baseUrl}/admin/tool/mobile/launch.php?` + new URLSearchParams({
        service: "moodle_mobile_app",
        passport,
        urlscheme: "moodlemobile",
      });
      const response = await context.request.get(launchUrl, { maxRedirects: 0 });
      const location = response.headers().location || "";
      const token = decodeMobileToken(location, baseUrl, passport);
      saved.years[year] = { baseUrl, ...token, createdAt: new Date().toISOString() };
      refreshed.push(year);
      console.log(`${year}: token saved`);
    } catch (error) {
      console.warn(`${year}: skipped - ${error.message}`);
    }
  }

  if (!refreshed.length) throw new Error("No Moodle tokens were created");
  saved.version = 1;
  saved.updatedAt = new Date().toISOString();
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(tokensPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
  console.log(`Authentication ready for: ${refreshed.join(", ")}`);
  console.log("Run: npm run auth:check");
} finally {
  await context.close();
}
