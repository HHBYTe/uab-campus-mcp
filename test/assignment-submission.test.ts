import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AssignmentSubmission } from "../src/assignment-submission.js";
import type { MoodleClient } from "../src/moodle-client.js";

test("assignment submission requires both confirmations and verifies the exact file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uab-submit-test-"));
  let state: "empty" | "draft" | "submitted" = "empty";
  let uploads = 0;
  let saves = 0;
  let submits = 0;
  let failUpload = false;
  const assignment = { id: 2, cmid: 7, course: 1, name: "Example", nosubmissions: 0, submissiondrafts: 1,
    teamsubmission: 0, timelimit: 0, allowsubmissionsfromdate: 0, duedate: 0, cutoffdate: 0,
    requiresubmissionstatement: 0, configs: [
      { subtype: "assignsubmission", plugin: "file", name: "enabled", value: "1" },
      { subtype: "assignsubmission", plugin: "file", name: "maxfilesubmissions", value: "1" },
      { subtype: "assignsubmission", plugin: "file", name: "maxsubmissionsizebytes", value: "100" },
      { subtype: "assignsubmission", plugin: "file", name: "filetypeslist", value: "" },
    ] };
  const moodle = {
    async call(_year: string, fn: string) {
      if (fn === "core_webservice_get_site_info") return { userid: 9, functions: [{ name: "mod_assign_save_submission" }, { name: "mod_assign_submit_for_grading" }] };
      if (fn === "mod_assign_get_assignments") return { courses: [{ assignments: [assignment] }], warnings: [] };
      if (fn === "mod_assign_get_submission_status") return { lastattempt: {
        submissionsenabled: true, locked: false, canedit: true, caneditowner: true, cansubmit: state === "draft",
        ...(state === "empty" ? {} : { submission: { id: 3, userid: 9, assignment: 2, status: state,
          plugins: [{ type: "file", fileareas: [{ files: [{ filename: "work.txt", filesize: 3, fileurl: "https://e-aules.uab.cat/2026-27/pluginfile.php/1/file" }] }] }] } }),
      }, warnings: [] };
      throw new Error("unexpected function");
    },
    async uploadAssignmentFile() { uploads++; if (failUpload) throw new Error("connection lost"); return 77; },
    async saveAssignmentDraft() { saves++; state = assignment.submissiondrafts === 0 ? "submitted" : "draft"; },
    async submitAssignment() { submits++; state = "submitted"; },
    async fetchFile() { return { content: new Uint8Array([1, 2, 3]), mediaType: "application/octet-stream" }; },
  } as unknown as MoodleClient;
  try {
    const service = new AssignmentSubmission(moodle, directory);
    const stale = await service.preview("2026-27", 1, 2, "work.txt", "AQID");
    assignment.duedate = 123;
    await assert.rejects(() => service.save(stale.planId, stale.sha256, "stale-key-1234567", "SAVE DRAFT"), /rules changed/);
    assert.equal(uploads, 0);
    assignment.duedate = 0;
    await assert.rejects(() => service.preview("2026-27", 1, 2, ".pdf", "AQID"), /starting with a dot/);
    const plan = await service.preview("2026-27", 1, 2, "work.txt", "AQID");
    await assert.rejects(() => service.save(plan.planId, plan.sha256, "save-key-123456789", "wrong"), /confirmation/);
    assert.equal(uploads, 0);
    const saved = await service.save(plan.planId, plan.sha256, "save-key-123456789", "SAVE DRAFT");
    assert.equal(saved.verified, true);
    assert.equal(state, "draft");
    await assert.rejects(() => service.submit(plan.planId, plan.sha256, "submit-key-123456", "wrong"), /confirmation/);
    assert.equal(submits, 0);
    const submitted = await service.submit(plan.planId, plan.sha256, "submit-key-123456", "SUBMIT FOR GRADING");
    assert.equal(submitted.verified, true);
    assert.equal(state, "submitted");
    await assert.rejects(() => service.submit(plan.planId, plan.sha256, "submit-key-123456", "SUBMIT FOR GRADING"), /already used/);
    state = "empty";
    assignment.submissiondrafts = 0;
    const direct = await service.preview("2026-27", 1, 2, "work.txt", "AQID");
    assert.match(direct.submissionMode, /immediately/);
    await assert.rejects(() => service.save(direct.planId, direct.sha256, "direct-key-123456", "SAVE DRAFT"), /immediately/);
    await assert.rejects(() => service.submitImmediate(direct.planId, direct.sha256, "direct-key-123456", "wrong"), /confirmation/);
    assert.equal(uploads, 1);
    const directResult = await service.submitImmediate(direct.planId, direct.sha256, "direct-key-123456", "SUBMIT FOR GRADING");
    assert.equal(directResult.verified, true);
    assert.equal(state, "submitted");
    assert.deepEqual({ uploads, saves, submits }, { uploads: 2, saves: 2, submits: 1 });
    state = "empty";
    failUpload = true;
    const uncertain = await service.preview("2026-27", 1, 2, "work.txt", "AQID");
    await assert.rejects(() => service.submitImmediate(uncertain.planId, uncertain.sha256, "uncertain-key-1234", "SUBMIT FOR GRADING"), /Do not retry automatically/);
    await assert.rejects(() => service.submitImmediate(uncertain.planId, uncertain.sha256, "uncertain-key-1234", "SUBMIT FOR GRADING"), /already used/);
    assert.equal(saves, 2);
    const next = await service.preview("2026-27", 1, 2, "work.txt", "AQID");
    await assert.rejects(() => service.submitImmediate(next.planId, next.sha256, "uncertain-key-1234", "SUBMIT FOR GRADING"), (error: Error) => /idempotency key was already used/.test(error.message) && !error.message.includes(directory));
    assert.equal(uploads, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
