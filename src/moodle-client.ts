import type { MoodleParameters, MoodleValue } from "./types.js";
import { TokenStore } from "./token-store.js";

export const READ_ONLY_FUNCTIONS = new Set([
  "core_calendar_get_action_events_by_course",
  "core_calendar_get_action_events_by_timesort",
  "core_calendar_get_calendar_event_by_id",
  "core_calendar_get_calendar_events",
  "core_completion_get_activities_completion_status",
  "core_course_get_contents",
  "core_course_get_course_module",
  "core_course_get_courses_by_field",
  "core_enrol_get_users_courses",
  "core_group_get_course_user_groups",
  "core_message_get_unread_notification_count",
  "core_user_get_private_files_info",
  "core_webservice_get_site_info",
  "gradereport_overview_get_course_grades",
  "gradereport_user_get_grade_items",
  "message_popup_get_popup_notifications",
  "message_popup_get_unread_popup_notification_count",
  "mod_assign_get_assignments",
  "mod_assign_get_submission_status",
  "mod_book_get_books_by_courses",
  "mod_choice_get_choice_options",
  "mod_choice_get_choices_by_courses",
  "mod_choicegroup_get_choicegroup_options",
  "mod_forum_get_discussion_posts",
  "mod_forum_get_forum_discussions",
  "mod_forum_get_forums_by_courses",
  "mod_h5pactivity_get_attempts",
  "mod_h5pactivity_get_h5pactivities_by_courses",
  "mod_h5pactivity_get_results",
  "mod_page_get_pages_by_courses",
  "mod_quiz_get_quizzes_by_courses",
  "mod_quiz_get_user_attempts",
  "mod_quiz_get_user_best_grade",
  "mod_scorm_get_scorm_attempt_count",
  "mod_scorm_get_scorm_sco_tracks",
  "mod_scorm_get_scorm_scoes",
  "mod_scorm_get_scorms_by_courses",
]);

function appendValue(body: URLSearchParams, key: string, value: MoodleValue): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendValue(body, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => {
      appendValue(body, `${key}[${childKey}]`, childValue);
    });
    return;
  }
  body.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}

// Moodle localises error messages (Catalan on UAB), so common error codes get
// a short English hint. The original message and code are always kept.
const MOODLE_ERROR_HINTS: Record<string, string> = {
  requireloginerror:
    "The course or activity is not accessible to this account: it may be hidden, restricted, or in a course you are not enrolled in.",
  invalidrecord:
    "No record with that ID exists. Check that the ID is the right kind (for example an assignment ID from campus_list_assignments, not a course-module ID from a URL) and the right academic year.",
  invalidrecordunknown:
    "No record with that ID exists. Check that the ID is the right kind (course-module, course, or activity instance ID) and the right academic year.",
  invalidtoken:
    "The token for this academic year is invalid or expired. The account owner must run `npm run auth` again.",
};

export function describeMoodleError(errorcode: unknown, message: unknown): string {
  const text = typeof message === "string" && message ? message : "Moodle rejected the request";
  if (typeof errorcode !== "string" || !errorcode) return text;
  const hint = MOODLE_ERROR_HINTS[errorcode];
  return hint ? `${hint} Moodle said: ${text} (${errorcode})` : `${text} (${errorcode})`;
}

export function encodeMoodleParameters(parameters: MoodleParameters): URLSearchParams {
  const body = new URLSearchParams();
  Object.entries(parameters).forEach(([key, value]) => appendValue(body, key, value));
  return body;
}

export function moodleFileDownloadUrl(fileUrl: string, baseUrl: string): URL {
  const source = new URL(fileUrl);
  const base = new URL(baseUrl);
  const allowedQuery = [...source.searchParams.entries()].every(([key, value]) =>
    key === "forcedownload" && (value === "0" || value === "1"));
  if (
    source.protocol !== "https:"
    || source.hostname !== base.hostname
    || source.port !== base.port
    || source.username
    || source.password
    || source.hash
    || !allowedQuery
  ) {
    throw new Error("Resource URL does not belong to the configured UAB Moodle origin");
  }

  if (/\\|%(?:2f|5c|00|0a|0d)/i.test(source.pathname)) {
    throw new Error("Resource URL contains an invalid path");
  }
  let decodedPath = source.pathname;
  for (let index = 0; index < 3; index += 1) {
    const next = decodeURIComponent(decodedPath);
    if (next === decodedPath) break;
    decodedPath = next;
  }
  if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Resource URL contains a non-canonical path");
  }

  const basePath = base.pathname.replace(/\/$/, "");
  const webservicePrefix = `${basePath}/webservice/pluginfile.php`;
  const sessionPrefix = `${basePath}/pluginfile.php`;
  let suffix: string;
  if (source.pathname === webservicePrefix || source.pathname.startsWith(`${webservicePrefix}/`)) {
    suffix = source.pathname.slice(webservicePrefix.length);
  } else if (source.pathname === sessionPrefix || source.pathname.startsWith(`${sessionPrefix}/`)) {
    suffix = source.pathname.slice(sessionPrefix.length);
  } else {
    throw new Error("Resource URL is not an allowed Moodle plugin file");
  }
  return new URL(`${webservicePrefix}${suffix}`, base.origin);
}

export type MoodleDownloadedFile = {
  content: Uint8Array;
  mediaType: string;
};

export class MoodleClient {
  constructor(
    private readonly tokens: TokenStore,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async call<T>(year: string, functionName: string, parameters: MoodleParameters = {}): Promise<T> {
    if (!READ_ONLY_FUNCTIONS.has(functionName)) {
      throw new Error(`Moodle function is not in the read-only allowlist: ${functionName}`);
    }
    const config = await this.tokens.get(year);
    const body = encodeMoodleParameters({
      wstoken: config.token,
      wsfunction: functionName,
      moodlewsrestformat: "json",
      ...parameters,
    });
    const response = await this.fetchImpl(`${config.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Moodle returned HTTP ${response.status} for ${functionName}`);
    }
    const result = await response.json() as Record<string, unknown>;
    if (result.exception || result.errorcode) {
      throw new Error(describeMoodleError(result.errorcode, result.message));
    }
    return result as T;
  }

  async uploadAssignmentFile(year: string, filename: string, content: Uint8Array, itemId: number): Promise<number> {
    const config = await this.tokens.get(year);
    const form = new FormData();
    form.set("token", config.token);
    form.set("itemid", String(itemId));
    form.set("file", new Blob([new Uint8Array(content)]), filename);
    const response = await this.fetchImpl(`${config.baseUrl}/webservice/upload.php`, {
      method: "POST", body: form, redirect: "manual", signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok || response.status >= 300) throw new Error("Moodle upload failed; its outcome may be uncertain");
    const result = await response.json() as Array<{ itemid?: unknown }>;
    const id = Array.isArray(result) && result.length === 1 ? result[0]?.itemid : undefined;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || (itemId !== 0 && id !== itemId)) {
      throw new Error("Moodle upload returned an unexpected result; inspect the draft area before retrying");
    }
    return id;
  }

  async saveAssignmentDraft(year: string, assignmentId: number, itemId: number): Promise<void> {
    await this.writeAssignment(year, "mod_assign_save_submission", { assignmentid: assignmentId, plugindata: { files_filemanager: itemId } });
  }

  async submitAssignment(year: string, assignmentId: number): Promise<void> {
    await this.writeAssignment(year, "mod_assign_submit_for_grading", { assignmentid: assignmentId, acceptsubmissionstatement: false });
  }

  private async writeAssignment(year: string, functionName: "mod_assign_save_submission" | "mod_assign_submit_for_grading", parameters: MoodleParameters): Promise<void> {
    const config = await this.tokens.get(year);
    const body = encodeMoodleParameters({ wstoken: config.token, wsfunction: functionName, moodlewsrestformat: "json", ...parameters });
    const response = await this.fetchImpl(`${config.baseUrl}/webservice/rest/server.php`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
      redirect: "manual", signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok || response.status >= 300) throw new Error("Moodle write failed; outcome may be uncertain. Check submission status before any retry");
    const result: unknown = await response.json();
    if (!Array.isArray(result) || result.length !== 0) throw new Error("Moodle rejected or warned about the write; check submission status before any retry");
  }

  async fetchFile(year: string, fileUrl: string, maxBytes: number): Promise<MoodleDownloadedFile> {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 50 * 1024 * 1024) {
      throw new Error("maxBytes must be between 1 and 52428800");
    }
    const config = await this.tokens.get(year);
    const url = moodleFileDownloadUrl(fileUrl, config.baseUrl);
    url.searchParams.set("token", config.token);
    const response = await this.fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Moodle resource download unexpectedly redirected");
    }
    if (!response.ok) {
      throw new Error(`Moodle returned HTTP ${response.status} for resource download`);
    }

    const declaredSize = response.headers.get("content-length");
    if (declaredSize && /^\d+$/.test(declaredSize) && Number(declaredSize) > maxBytes) {
      throw new Error("Moodle resource exceeds maxBytes");
    }
    if (!response.body) throw new Error("Moodle resource response has no body");

    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloadedBytes += value.byteLength;
        if (downloadedBytes > maxBytes) {
          await reader.cancel();
          throw new Error("Moodle resource exceeds maxBytes");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const content = new Uint8Array(downloadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      content.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      content,
      mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "",
    };
  }
}
