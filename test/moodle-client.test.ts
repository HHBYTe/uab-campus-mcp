import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMoodleError,
  encodeMoodleParameters,
  moodleFileDownloadUrl,
  MoodleClient,
  READ_ONLY_FUNCTIONS,
} from "../src/moodle-client.js";
import { TokenStore } from "../src/token-store.js";

test("encodeMoodleParameters uses Moodle bracket notation", () => {
  const encoded = encodeMoodleParameters({
    events: { courseids: [10, 20] },
    options: { timestart: 123, userevents: true },
  });
  assert.equal(encoded.get("events[courseids][0]"), "10");
  assert.equal(encoded.get("events[courseids][1]"), "20");
  assert.equal(encoded.get("options[timestart]"), "123");
  assert.equal(encoded.get("options[userevents]"), "1");
});

test("MoodleClient permits allowlisted reads and rejects arbitrary functions", async () => {
  const tokenStore = {
    get: async () => ({ baseUrl: "https://e-aules.uab.cat/2026-27", token: "secret-token" }),
  } as unknown as TokenStore;
  let postedBody = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    postedBody = String(init?.body);
    return new Response(JSON.stringify({ userid: 42 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new MoodleClient(tokenStore, 5_000, fakeFetch);

  assert.deepEqual(
    await client.call("2026-27", "core_webservice_get_site_info"),
    { userid: 42 },
  );
  assert.match(postedBody, /wstoken=secret-token/);
  await client.call("2026-27", "core_course_get_course_module", { cmid: 123 });
  assert.match(postedBody, /wsfunction=core_course_get_course_module/);
  assert.match(postedBody, /cmid=123/);
  await assert.rejects(
    () => client.call("2026-27", "core_course_delete_courses"),
    /not in the read-only allowlist/,
  );
});

test("assignment writes use only named operations and the bounded upload endpoint", async () => {
  const tokenStore = { get: async () => ({ baseUrl: "https://e-aules.uab.cat/2026-27", token: "test-token" }) } as unknown as TokenStore;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(String(url).endsWith("upload.php") ? [{ itemid: 9 }] : []), { status: 200 });
  };
  const client = new MoodleClient(tokenStore, 5_000, fakeFetch);
  assert.equal(await client.uploadAssignmentFile("2026-27", "work.txt", new Uint8Array([1, 2, 3]), 0), 9);
  await client.saveAssignmentDraft("2026-27", 2, 9);
  await client.submitAssignment("2026-27", 2);
  assert.equal(requests[0]?.init?.redirect, "manual");
  assert.equal((requests[0]?.init?.body as FormData).get("itemid"), "0");
  const save = requests[1]?.init?.body as URLSearchParams;
  assert.equal(save.get("wsfunction"), "mod_assign_save_submission");
  assert.equal(save.get("plugindata[files_filemanager]"), "9");
  const submit = requests[2]?.init?.body as URLSearchParams;
  assert.equal(submit.get("wsfunction"), "mod_assign_submit_for_grading");
  assert.equal(submit.get("acceptsubmissionstatement"), "0");
  assert.equal(READ_ONLY_FUNCTIONS.has("mod_assign_submit_for_grading"), false);
});

test("Group Choice allowlist permits options but excludes view and response writes", () => {
  assert.equal(READ_ONLY_FUNCTIONS.has("mod_choicegroup_get_choicegroup_options"), true);
  assert.equal(READ_ONLY_FUNCTIONS.has("mod_choicegroup_view_choicegroup"), false);
  assert.equal(READ_ONLY_FUNCTIONS.has("mod_choicegroup_submit_choicegroup_response"), false);
  assert.equal(READ_ONLY_FUNCTIONS.has("mod_choicegroup_delete_choicegroup_responses"), false);
});

test("course action-event allowlist permits the bounded read but excludes calendar writes", () => {
  assert.equal(READ_ONLY_FUNCTIONS.has("core_calendar_get_action_events_by_course"), true);
  assert.equal(READ_ONLY_FUNCTIONS.has("core_calendar_create_calendar_events"), false);
  assert.equal(READ_ONLY_FUNCTIONS.has("core_calendar_update_event_start_day"), false);
  assert.equal(READ_ONLY_FUNCTIONS.has("core_calendar_delete_calendar_events"), false);
});

test("moodleFileDownloadUrl confines downloads to the configured yearly pluginfile path", () => {
  assert.equal(
    moodleFileDownloadUrl(
      "https://e-aules.uab.cat/2026-27/pluginfile.php/10/mod_resource/content/1/file.pdf?forcedownload=1",
      "https://e-aules.uab.cat/2026-27",
    ).href,
    "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/10/mod_resource/content/1/file.pdf",
  );
  assert.throws(
    () => moodleFileDownloadUrl(
      "https://example.com/2026-27/pluginfile.php/10/file.pdf",
      "https://e-aules.uab.cat/2026-27",
    ),
    /does not belong/,
  );
  assert.throws(
    () => moodleFileDownloadUrl(
      "https://e-aules.uab.cat/2026-27/pluginfile.php/10/file.pdf?token=attacker-controlled",
      "https://e-aules.uab.cat/2026-27",
    ),
    /does not belong/,
  );
  assert.throws(
    () => moodleFileDownloadUrl(
      "https://e-aules.uab.cat/2026-27/pluginfile.php/%2e%2e/file.pdf",
      "https://e-aules.uab.cat/2026-27",
    ),
    /non-canonical|not an allowed/,
  );
});

test("MoodleClient downloads bounded plugin files without following redirects", async () => {
  const tokenStore = {
    get: async () => ({ baseUrl: "https://e-aules.uab.cat/2026-27", token: "secret-token" }),
  } as unknown as TokenStore;
  let requestedUrl = "";
  let redirectMode: RequestRedirect | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    redirectMode = init?.redirect;
    return new Response("hello", {
      status: 200,
      headers: { "content-type": "text/plain", "content-length": "5" },
    });
  };
  const client = new MoodleClient(tokenStore, 5_000, fakeFetch);
  const result = await client.fetchFile(
    "2026-27",
    "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/10/file.txt",
    5,
  );

  assert.equal(new TextDecoder().decode(result.content), "hello");
  assert.equal(result.mediaType, "text/plain");
  assert.equal(redirectMode, "manual");
  assert.match(requestedUrl, /token=secret-token/);
  await assert.rejects(
    () => client.fetchFile(
      "2026-27",
      "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/10/file.txt",
      4,
    ),
    /exceeds maxBytes/,
  );
});

test("MoodleClient keeps Moodle's error code and message and adds an English hint", async () => {
  const tokenStore = {
    get: async () => ({ baseUrl: "https://e-aules.uab.cat/2026-27", token: "secret-token" }),
  } as unknown as TokenStore;
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    exception: "core\\exception\\require_login_exception",
    errorcode: "requireloginerror",
    message: "No es pot accedir al curs o l'activitat.",
  }), { status: 200, headers: { "content-type": "application/json" } });
  const client = new MoodleClient(tokenStore, 5_000, fakeFetch);
  await assert.rejects(
    () => client.call("2026-27", "core_course_get_course_module", { cmid: 1 }),
    (error: Error) => /not accessible/.test(error.message)
      && error.message.includes("No es pot accedir al curs o l'activitat. (requireloginerror)"),
  );
});

test("describeMoodleError explains common codes and passes others through", () => {
  assert.match(describeMoodleError("invalidrecord", "No s'ha pogut trobar"), /assignment ID .* not a course-module ID/);
  assert.match(describeMoodleError("invalidrecord", "No s'ha pogut trobar"), /No s'ha pogut trobar \(invalidrecord\)$/);
  assert.match(describeMoodleError("invalidtoken", "Token invàlid"), /npm run auth.*\(invalidtoken\)$/);
  assert.equal(describeMoodleError("nopermissions", "Sense permís"), "Sense permís (nopermissions)");
  assert.equal(describeMoodleError(undefined, undefined), "Moodle rejected the request");
});

test("popup unread count is allowlisted but marking notifications read is not", () => {
  assert.equal(READ_ONLY_FUNCTIONS.has("message_popup_get_unread_popup_notification_count"), true);
  assert.equal(READ_ONLY_FUNCTIONS.has("core_message_mark_notification_read"), false);
  assert.equal(READ_ONLY_FUNCTIONS.has("core_message_mark_all_notifications_as_read"), false);
});
