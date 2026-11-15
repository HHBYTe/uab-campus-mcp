import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TokenStore } from "../src/token-store.js";

test("TokenStore reads configured years without exposing tokens", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-campus-mcp-"));
  const tokenFile = path.join(directory, "tokens.json");
  await writeFile(tokenFile, JSON.stringify({
    version: 1,
    updatedAt: "2026-10-22T00:00:00.000Z",
    years: {
      "2026-27": {
        baseUrl: "https://e-aules.uab.cat/2026-27/",
        token: "private-value",
      },
    },
  }));

  try {
    const store = new TokenStore(tokenFile);
    assert.deepEqual(await store.years(), ["2026-27"]);
    assert.equal((await store.get("2026-27")).baseUrl, "https://e-aules.uab.cat/2026-27");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("TokenStore refuses non-UAB Moodle origins", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-campus-mcp-"));
  const tokenFile = path.join(directory, "tokens.json");
  await writeFile(tokenFile, JSON.stringify({
    years: {
      "2026-27": { baseUrl: "https://example.com/moodle", token: "private-value" },
    },
  }));

  try {
    await assert.rejects(() => new TokenStore(tokenFile).read(), /unexpected Moodle origin/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
