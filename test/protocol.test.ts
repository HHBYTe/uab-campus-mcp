import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("stdio server lists and calls tools over MCP", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-campus-mcp-protocol-"));
  const tokenFile = path.join(directory, "tokens.json");
  await writeFile(tokenFile, JSON.stringify({
    version: 1,
    years: {
      "2026-27": {
        baseUrl: "https://e-aules.uab.cat/2026-27/",
        token: "not-used-by-this-test",
      },
    },
  }));

  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  env.UAB_TOKEN_FILE = tokenFile;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/index.js")],
    cwd: process.cwd(),
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "uab-campus-mcp-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map(({ name }) => name).sort(),
      [
        "campus_auth_status",
        "campus_download_resource",
        "campus_download_submission_file",
        "campus_find_courses",
        "campus_get_assignment_details",
        "campus_get_assignment_status",
        "campus_get_calendar_event",
        "campus_get_calendar_events",
        "campus_get_choice_options",
        "campus_get_completion_status",
        "campus_get_course_actions",
        "campus_get_course_contents",
        "campus_get_course_module",
        "campus_get_discussion_posts",
        "campus_get_forum_discussions",
        "campus_get_grade_overview",
        "campus_get_grades",
        "campus_get_group_choice_options",
        "campus_get_h5p_attempts",
        "campus_get_h5p_results",
        "campus_get_my_groups",
        "campus_get_page",
        "campus_get_private_files_info",
        "campus_get_profile",
        "campus_get_quiz_attempts",
        "campus_get_quiz_best_grade",
        "campus_get_scorm_attempt_count",
        "campus_get_scorm_structure",
        "campus_get_scorm_tracks",
        "campus_get_unread_notification_count",
        "campus_get_upcoming_actions",
        "campus_list_assignments",
        "campus_list_books",
        "campus_list_choices",
        "campus_list_courses",
        "campus_list_forums",
        "campus_list_h5p_activities",
        "campus_list_notifications",
        "campus_list_quizzes",
        "campus_list_resources",
        "campus_list_scorm_activities",
        "campus_list_years",
        "campus_preview_submission",
        "campus_read_assignment_attachment",
        "campus_read_resource",
      ],
    );
    const result = await client.callTool({ name: "campus_list_years", arguments: {} });
    assert.deepEqual(result.structuredContent, { data: { years: ["2026-27"] } });
    const writeEnv = { ...env, UAB_ENABLE_ASSIGNMENT_WRITES: "true", UAB_ASSIGNMENT_AUDIT_DIR: directory };
    const writeTransport = new StdioClientTransport({ command: process.execPath,
      args: [path.resolve("dist/index.js")], cwd: process.cwd(), env: writeEnv, stderr: "pipe" });
    const writeClient = new Client({ name: "uab-submit-discovery-test", version: "1" });
    try {
      await writeClient.connect(writeTransport);
      const writeTools = (await writeClient.listTools()).tools;
      assert.ok(writeTools.some(({ name }) => name === "campus_prepare_assignment_submission"));
      assert.equal(writeTools.find(({ name }) => name === "campus_save_assignment_draft")?.annotations?.readOnlyHint, false);
      assert.equal(writeTools.find(({ name }) => name === "campus_submit_assignment")?.annotations?.readOnlyHint, false);
      assert.equal(writeTools.find(({ name }) => name === "campus_submit_assignment_direct")?.annotations?.readOnlyHint, false);
    } finally {
      await writeClient.close();
    }
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
