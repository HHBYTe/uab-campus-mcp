#!/usr/bin/env node

import http from "node:http";

import {
  hostHeaderValidation,
  toNodeHandler,
  type NodeIncomingMessageLike,
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { buildServer } from "./app.js";
import { httpConfig } from "./config.js";
import { validBearerToken } from "./http-auth.js";

const config = httpConfig();
const validateHost = hostHeaderValidation(config.allowedHosts);
const handler = createMcpHandler(() => buildServer(), {
  legacy: "stateless",
  onerror: (error) => console.error("MCP request failed:", error.message),
});
const serveMcp = toNodeHandler(handler, {
  onerror: (error) => console.error("HTTP adapter failed:", error.message),
  maxRequestBodySize: 1024 * 1024,
});

const server = http.createServer((request, response) => {
  if (!validateHost(request, response)) return;

  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (request.method === "GET" && path === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}\n');
    return;
  }
  if (path !== "/mcp") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not found"}\n');
    return;
  }
  if (!validBearerToken(request.headers.authorization, config.bearerToken)) {
    response.writeHead(401, {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="uab-campus-mcp"',
    });
    response.end('{"error":"unauthorized"}\n');
    return;
  }

  void serveMcp(request as unknown as NodeIncomingMessageLike, response);
});

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.error(`uab-campus-mcp listening on http://${config.host}:${port}/mcp`);
});

async function shutdown() {
  server.close();
  await handler.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
