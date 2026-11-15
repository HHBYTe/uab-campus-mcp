import { MoodleClient, READ_ONLY_FUNCTIONS } from "./moodle-client.js";
import { TokenStore } from "./token-store.js";
import type { SiteInfo } from "./types.js";

export type AuthenticationCheck = {
  year: string;
  status: "ok" | "authentication_failed" | "unreachable" | "remote_error";
  site?: string;
  readOnlyCapabilityCount?: number;
};

function classifyMoodleError(error: unknown): AuthenticationCheck["status"] {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/invalidtoken|token.*(expired|invalid)|access control exception|not logged/.test(message)) {
    return "authentication_failed";
  }
  if (/timeout|timed out|fetch failed|enotfound|econnrefused|network/.test(message)) {
    return "unreachable";
  }
  return "remote_error";
}

export async function diagnoseAuthentication(tokens: TokenStore, moodle: MoodleClient) {
  let years: string[];
  try {
    years = await tokens.years();
  } catch {
    return {
      status: "configuration_error" as const,
      configuredYears: 0,
      checks: [] as AuthenticationCheck[],
    };
  }

  const checks = await Promise.all(years.map(async (year): Promise<AuthenticationCheck> => {
    try {
      const info = await moodle.call<SiteInfo>(year, "core_webservice_get_site_info");
      const exposed = new Set((info.functions ?? []).map(({ name }) => name));
      return {
        year,
        status: "ok",
        ...(info.sitename ? { site: info.sitename } : {}),
        readOnlyCapabilityCount: [...READ_ONLY_FUNCTIONS].filter((name) => exposed.has(name)).length,
      };
    } catch (error) {
      return { year, status: classifyMoodleError(error) };
    }
  }));

  return {
    status: checks.length > 0 && checks.every(({ status }) => status === "ok") ? "ok" as const : "degraded" as const,
    configuredYears: years.length,
    checks,
  };
}
