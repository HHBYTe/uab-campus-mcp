import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolveTokenFile(): string {
  const configured = process.env.UAB_TOKEN_FILE?.trim();
  return configured ? path.resolve(configured) : path.join(projectRoot, "data", "tokens.json");
}

export function requestTimeoutMs(): number {
  const raw = process.env.UAB_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return 30_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 120_000) {
    throw new Error("UAB_REQUEST_TIMEOUT_MS must be an integer from 1000 to 120000");
  }
  return value;
}

export type HttpConfig = {
  host: string;
  port: number;
  bearerToken: string;
  allowedHosts: string[];
};

export function httpConfig(): HttpConfig {
  const host = process.env.MCP_HOST?.trim() || "127.0.0.1";
  const rawPort = process.env.MCP_PORT?.trim() || "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("MCP_PORT must be an integer from 0 to 65535");
  }

  const bearerToken = process.env.MCP_HTTP_TOKEN?.trim() || "";
  if (bearerToken.length < 32 || bearerToken.startsWith("replace-with-")) {
    throw new Error("MCP_HTTP_TOKEN must be a non-placeholder secret of at least 32 characters");
  }

  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || "localhost,127.0.0.1,[::1]")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedHosts.length) throw new Error("MCP_ALLOWED_HOSTS must not be empty");

  return { host, port, bearerToken, allowedHosts };
}

export const academicYearPattern = /^\d{4}-\d{2}$/;
