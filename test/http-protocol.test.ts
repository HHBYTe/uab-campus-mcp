import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const bearerToken = "http-protocol-test-token-with-32-characters";

function waitForPort(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`HTTP server did not start: ${stderr}`)), 10_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/127\.0\.0\.1:(\d+)\/mcp/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`HTTP server exited with ${code}: ${stderr}`));
    });
  });
}

test("Streamable HTTP requires authentication and serves MCP", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-campus-http-"));
  const tokenFile = path.join(directory, "tokens.json");
  await writeFile(tokenFile, JSON.stringify({
    version: 1,
    years: {
      "2026-27": {
        baseUrl: "https://e-aules.uab.cat/2026-27",
        token: "not-used-by-this-test",
      },
    },
  }));

  const child = spawn(process.execPath, ["--import", "tsx", "src/http.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      UAB_TOKEN_FILE: tokenFile,
      MCP_HOST: "127.0.0.1",
      MCP_PORT: "0",
      MCP_HTTP_TOKEN: bearerToken,
      MCP_ALLOWED_HOSTS: "127.0.0.1",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    const port = await waitForPort(child);
    const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
    const unauthenticated = await fetch(endpoint, { method: "POST", body: "{}" });
    assert.equal(unauthenticated.status, 401);

    const client = new Client({ name: "http-protocol-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      authProvider: { token: async () => bearerToken },
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some(({ name }) => name === "campus_list_years"));
    const result = await client.callTool({ name: "campus_list_years", arguments: {} });
    assert.deepEqual(result.structuredContent, { data: { years: ["2026-27"] } });
    await client.close();
  } finally {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  }
});
