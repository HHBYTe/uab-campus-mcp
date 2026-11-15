#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { buildServer } from "./app.js";

void serveStdio(() => buildServer(true));
console.error("uab-campus-mcp running on stdio");
