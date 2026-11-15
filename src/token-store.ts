import fs from "node:fs/promises";

import { academicYearPattern } from "./config.js";
import type { AcademicYearToken, TokenFile } from "./types.js";

function validateYearToken(year: string, value: unknown): AcademicYearToken {
  if (!academicYearPattern.test(year)) {
    throw new Error(`Invalid academic year key in token file: ${year}`);
  }
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid token entry for ${year}`);
  }
  const candidate = value as Partial<AcademicYearToken>;
  if (typeof candidate.baseUrl !== "string" || typeof candidate.token !== "string") {
    throw new Error(`Token entry for ${year} is missing baseUrl or token`);
  }
  const url = new URL(candidate.baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "e-aules.uab.cat") {
    throw new Error(`Refusing unexpected Moodle origin for ${year}: ${url.origin}`);
  }
  return {
    baseUrl: url.href.replace(/\/$/, ""),
    token: candidate.token,
    ...(candidate.privateToken ? { privateToken: candidate.privateToken } : {}),
    ...(candidate.createdAt ? { createdAt: candidate.createdAt } : {}),
  };
}

export class TokenStore {
  constructor(readonly path: string) {}

  async read(): Promise<TokenFile> {
    let contents: string;
    try {
      contents = await fs.readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          `No UAB token file at ${this.path}. Set UAB_TOKEN_FILE to the helper's private tokens.json`,
        );
      }
      throw error;
    }

    const parsed = JSON.parse(contents) as Partial<TokenFile>;
    if (!parsed.years || typeof parsed.years !== "object") {
      throw new Error(`Invalid UAB token file at ${this.path}`);
    }

    const years = Object.fromEntries(
      Object.entries(parsed.years).map(([year, value]) => [year, validateYearToken(year, value)]),
    );
    return {
      ...(parsed.version !== undefined ? { version: parsed.version } : {}),
      ...(parsed.updatedAt ? { updatedAt: parsed.updatedAt } : {}),
      years,
    };
  }

  async years(): Promise<string[]> {
    return Object.keys((await this.read()).years).sort();
  }

  async get(year: string): Promise<AcademicYearToken> {
    if (!academicYearPattern.test(year)) {
      throw new Error("Academic year must look like 2026-27");
    }
    const entry = (await this.read()).years[year];
    if (!entry) {
      throw new Error(`No Moodle token is configured for ${year}`);
    }
    return entry;
  }
}
