import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("doctor emits share-safe JSON without token values or private paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-campus-doctor-private-"));
  const tokenFile = path.join(directory, "tokens.json");
  const privateToken = "private-doctor-test-token";
  await writeFile(tokenFile, JSON.stringify({
    years: {
      "2026-27": {
        baseUrl: "https://e-aules.uab.cat/2026-27",
        token: privateToken,
      },
    },
  }), { mode: 0o600 });

  try {
    const result = spawnSync(process.execPath, ["scripts/doctor.mjs", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, UAB_TOKEN_FILE: tokenFile },
      encoding: "utf8",
    });
    const supportedRuntime = Number(process.versions.node.split(".")[0]) >= 20;
    assert.equal(result.status, supportedRuntime ? 0 : 1, result.stderr);
    assert.doesNotMatch(result.stdout, new RegExp(privateToken));
    assert.doesNotMatch(result.stdout, new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: Array<{ name: string; status: string }>;
    };
    assert.equal(report.ok, supportedRuntime);
    assert.equal(report.checks.find(({ name }) => name === "token_file")?.status, "ok");
    assert.equal(
      report.checks.find(({ name }) => name === "node_runtime")?.status,
      supportedRuntime ? "ok" : "error",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
