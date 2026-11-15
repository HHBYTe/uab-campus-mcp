import assert from "node:assert/strict";
import test from "node:test";
import { checkSubmissionEligibility, hasRelevantAssignmentWarnings, isEmptyPlaceholderSubmission } from "../src/submission-eligibility.js";

test("unrelated module warnings do not conceal warnings for the selected assignment", () => {
  assert.equal(hasRelevantAssignmentWarnings([{ item: "module", itemid: 99 }], 7), false);
  assert.equal(hasRelevantAssignmentWarnings([{ item: "module", itemid: 7 }], 7), true);
  assert.equal(hasRelevantAssignmentWarnings([{ item: "course", itemid: 99 }], 7), true);
  assert.equal(hasRelevantAssignmentWarnings([{ item: "module" }], 7), true);
});

test("submission eligibility rejects ambiguous, existing, group and final-on-save cases", () => {
  const fileRules = [
    { subtype: "assignsubmission", plugin: "file", name: "enabled", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxfilesubmissions", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxsubmissionsizebytes", value: "1048576" },
    { subtype: "assignsubmission", plugin: "file", name: "filetypeslist", value: "" },
  ];
  const assignment = { id: 4, course: 2, nosubmissions: 0, submissiondrafts: 1, teamsubmission: 0, timelimit: 0, allowsubmissionsfromdate: 0, cutoffdate: 0, requiresubmissionstatement: 0, configs: fileRules };
  const attempt = { teamsubmission: false, submissionsenabled: true, locked: false, canedit: true, caneditowner: true };
  const expected = { courseId: 2, assignmentId: 4, now: 100 };
  assert.deepEqual(checkSubmissionEligibility(assignment, attempt, expected), []);
  assert.ok(checkSubmissionEligibility({ ...assignment, submissiondrafts: 0 }, attempt, expected).length);
  assert.deepEqual(checkSubmissionEligibility({ ...assignment, submissiondrafts: 0, configs: [...assignment.configs, { subtype: "assignsubmission", plugin: "comments", name: "enabled", value: "1" }] }, attempt, { ...expected, allowImmediate: true }), []);
  assert.ok(checkSubmissionEligibility({ ...assignment, teamsubmission: 1 }, attempt, expected).length);
  assert.ok(checkSubmissionEligibility(assignment, { ...attempt, submission: {} }, expected).length);
  assert.ok(checkSubmissionEligibility(assignment, { ...attempt, locked: true }, expected).length);
  assert.ok(checkSubmissionEligibility({ ...assignment, configs: [] }, attempt, expected).length);
  assert.ok(checkSubmissionEligibility({ ...assignment, configs: [...assignment.configs, { subtype: "assignsubmission", plugin: "online", name: "enabled", value: "unknown" }] }, attempt, expected).length);
  assert.ok(checkSubmissionEligibility({ ...assignment, cutoffdate: 99 }, attempt, expected).length);
});

test("an empty Moodle placeholder submission does not block eligibility", () => {
  const configs = [
    { subtype: "assignsubmission", plugin: "file", name: "enabled", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxfilesubmissions", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxsubmissionsizebytes", value: "1048576" },
    { subtype: "assignsubmission", plugin: "file", name: "filetypeslist", value: "" },
  ];
  const assignment = { id: 4, course: 2, nosubmissions: 0, submissiondrafts: 0, teamsubmission: 0, timelimit: 0, allowsubmissionsfromdate: 0, cutoffdate: 0, requiresubmissionstatement: 0, configs };
  const attempt = { teamsubmission: false, submissionsenabled: true, locked: false, canedit: true, caneditowner: true };
  const expected = { courseId: 2, assignmentId: 4, now: 100, allowImmediate: true };
  const placeholder = { id: 9, status: "new", plugins: [{ type: "file", fileareas: [{ area: "submission_files", files: [] }] }] };
  assert.equal(isEmptyPlaceholderSubmission(placeholder), true);
  assert.deepEqual(checkSubmissionEligibility(assignment, { ...attempt, submission: placeholder }, expected), []);
  for (const blocked of [
    { ...placeholder, status: "submitted" },
    { ...placeholder, status: "draft" },
    { ...placeholder, status: "reopened" },
    { ...placeholder, plugins: [{ type: "file", fileareas: [{ files: [{ filename: "a.pdf" }] }] }] },
    { ...placeholder, plugins: [{ type: "onlinetext", editorfields: [{ text: "<p>work</p>" }] }] },
  ]) {
    assert.equal(isEmptyPlaceholderSubmission(blocked), false);
    assert.ok(checkSubmissionEligibility(assignment, { ...attempt, submission: blocked }, expected).length);
  }
});

test("file rules and submission statements are checked before any file is chosen", () => {
  const base = [
    { subtype: "assignsubmission", plugin: "file", name: "enabled", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxfilesubmissions", value: "1" },
    { subtype: "assignsubmission", plugin: "file", name: "maxsubmissionsizebytes", value: "1048576" },
  ];
  const assignment = { id: 4, course: 2, nosubmissions: 0, submissiondrafts: 1, teamsubmission: 0, timelimit: 0, allowsubmissionsfromdate: 0, cutoffdate: 0, requiresubmissionstatement: 0 };
  const attempt = { teamsubmission: false, submissionsenabled: true, locked: false, canedit: true, caneditowner: true };
  const expected = { courseId: 2, assignmentId: 4, now: 100 };
  const open = [...base, { subtype: "assignsubmission", plugin: "file", name: "filetypeslist", value: "" }];
  assert.deepEqual(checkSubmissionEligibility({ ...assignment, configs: open }, attempt, expected), []);
  assert.ok(checkSubmissionEligibility({ ...assignment, configs: [...base, { subtype: "assignsubmission", plugin: "file", name: "filetypeslist", value: ".pdf" }] }, attempt, expected).length);
  assert.ok(checkSubmissionEligibility({ ...assignment, configs: base }, attempt, expected).length);
  assert.ok(checkSubmissionEligibility({ ...assignment, configs: open, requiresubmissionstatement: 1 }, attempt, expected).length);
});
