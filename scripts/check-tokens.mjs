import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokenFile = process.env.UAB_TOKEN_FILE?.trim() || path.join(root, "data", "tokens.json");
const saved = JSON.parse(await fs.readFile(tokenFile, "utf8"));
const results = [];

for (const [year, config] of Object.entries(saved.years || {}).sort()) {
  const body = new URLSearchParams({
    wstoken: config.token,
    wsfunction: "core_webservice_get_site_info",
    moodlewsrestformat: "json",
  });
  try {
    const response = await fetch(`${config.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const info = await response.json();
    if (!response.ok || info.exception || info.errorcode) {
      throw new Error(info.message || `HTTP ${response.status}`);
    }
    results.push({ year, authenticated: true, site: info.sitename, user: info.fullname });
  } catch (error) {
    results.push({ year, authenticated: false, error: error.message });
  }
}

console.log(JSON.stringify(results, null, 2));
process.exitCode = results.length > 0 && results.every((result) => result.authenticated) ? 0 : 1;
