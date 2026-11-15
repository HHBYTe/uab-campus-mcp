import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseAuthentication } from "../src/diagnostics.js";
import { MoodleClient } from "../src/moodle-client.js";
import { TokenStore } from "../src/token-store.js";

test("authentication diagnostics report safe per-year status", async () => {
  const tokens = {
    years: async () => ["2025-26", "2026-27"],
  } as unknown as TokenStore;
  const moodle = {
    call: async (year: string) => {
      if (year === "2025-26") throw new Error("Invalid token - token expired (invalidtoken)");
      return {
        sitename: "Aules de prova",
        functions: [
          { name: "core_webservice_get_site_info" },
          { name: "core_enrol_get_users_courses" },
        ],
      };
    },
  } as unknown as MoodleClient;

  assert.deepEqual(await diagnoseAuthentication(tokens, moodle), {
    status: "degraded",
    configuredYears: 2,
    checks: [
      { year: "2025-26", status: "authentication_failed" },
      {
        year: "2026-27",
        status: "ok",
        site: "Aules de prova",
        readOnlyCapabilityCount: 2,
      },
    ],
  });
});

test("authentication diagnostics hide token-store errors", async () => {
  const tokens = {
    years: async () => { throw new Error("No token file at /private/user/path/tokens.json"); },
  } as unknown as TokenStore;

  assert.deepEqual(
    await diagnoseAuthentication(tokens, {} as MoodleClient),
    { status: "configuration_error", configuredYears: 0, checks: [] },
  );
});
