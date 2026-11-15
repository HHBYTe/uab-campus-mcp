type AssignmentConfig = { subtype?: unknown; plugin?: unknown; name?: unknown; value?: unknown };
type Assignment = {
  id?: unknown;
  course?: unknown;
  nosubmissions?: unknown;
  submissiondrafts?: unknown;
  teamsubmission?: unknown;
  allowsubmissionsfromdate?: unknown;
  cutoffdate?: unknown;
  timelimit?: unknown;
  requiresubmissionstatement?: unknown;
  configs?: AssignmentConfig[];
};
type LastAttempt = {
  teamsubmission?: unknown;
  submissionsenabled?: unknown;
  locked?: unknown;
  canedit?: unknown;
  caneditowner?: unknown;
  submission?: unknown;
};

export function hasRelevantAssignmentWarnings(warnings: unknown, courseModuleId: unknown): boolean {
  if (warnings == null) return false;
  if (!Array.isArray(warnings) || !Number.isSafeInteger(courseModuleId) || Number(courseModuleId) <= 0) return true;
  return warnings.some((warning) => !warning || typeof warning !== "object"
    || warning.item !== "module" || !Number.isSafeInteger(warning.itemid)
    || warning.itemid <= 0
    || warning.itemid === courseModuleId);
}

type SubmissionRecord = {
  status?: unknown;
  plugins?: Array<{ fileareas?: Array<{ files?: unknown[] }>; editorfields?: Array<{ text?: unknown }> }>;
};

/**
 * Moodle creates an empty placeholder submission (status "new", no content)
 * once a student opens an assignment. It holds nothing to overwrite, so it is
 * treated like no submission. Anything else (draft, submitted, reopened, or a
 * "new" record with content) still needs manual handling.
 */
export function isEmptyPlaceholderSubmission(submission: unknown): boolean {
  if (!submission || typeof submission !== "object") return false;
  const record = submission as SubmissionRecord;
  if (record.status !== "new") return false;
  const plugins = Array.isArray(record.plugins) ? record.plugins : [];
  const hasFiles = plugins.some((plugin) => (Array.isArray(plugin.fileareas) ? plugin.fileareas : [])
    .some((area) => Array.isArray(area.files) && area.files.length > 0));
  const hasText = plugins.some((plugin) => (Array.isArray(plugin.editorfields) ? plugin.editorfields : [])
    .some((field) => typeof field.text === "string" && field.text.trim() !== ""));
  return !hasFiles && !hasText;
}

/** Fail closed unless Moodle explicitly describes a supported, empty personal draft. */
export function checkSubmissionEligibility(
  assignment: Assignment,
  attempt: LastAttempt,
  expected: { courseId: number; assignmentId: number; now: number; allowImmediate?: boolean },
): string[] {
  const reasons: string[] = [];
  if (assignment.id !== expected.assignmentId || assignment.course !== expected.courseId) reasons.push("Assignment does not belong to the selected course");
  if (assignment.nosubmissions !== 0) reasons.push("Assignment does not explicitly allow submissions");
  if (assignment.submissiondrafts !== 1 && !(expected.allowImmediate && assignment.submissiondrafts === 0)) reasons.push("Saving may be an effective final submission");
  if (assignment.teamsubmission !== 0 || (attempt.teamsubmission != null && attempt.teamsubmission !== false)) reasons.push("Group or unknown submission mode is unsupported");
  if (assignment.timelimit !== 0) reasons.push("Timed or unknown-duration assignments are unsupported");
  if (attempt.submissionsenabled !== true || attempt.locked !== false || attempt.canedit !== true || attempt.caneditowner !== true) reasons.push("Moodle has not confirmed that the submission is editable");
  if (attempt.submission != null && !isEmptyPlaceholderSubmission(attempt.submission)) reasons.push("An existing submission requires manual handling");
  if (assignment.requiresubmissionstatement !== 0) reasons.push("Assignments requiring a submission statement are not supported");
  if (typeof assignment.allowsubmissionsfromdate !== "number" || assignment.allowsubmissionsfromdate > expected.now) reasons.push("Submission opening time is unknown or in the future");
  if (typeof assignment.cutoffdate !== "number" || (assignment.cutoffdate !== 0 && assignment.cutoffdate <= expected.now)) reasons.push("Submission cutoff is unknown or has passed");
  if (!Array.isArray(assignment.configs)) {
    reasons.push("Submission plugin configuration is unavailable");
  } else {
    const pluginSettings = assignment.configs.filter((config) => config.subtype === "assignsubmission" && config.name === "enabled");
    if (pluginSettings.some((config) => !["0", "1"].includes(String(config.value)))) reasons.push("Submission plugin enablement is unknown");
    const enabled = pluginSettings.filter((config) => String(config.value) === "1");
    if (enabled.filter((config) => config.plugin === "file").length !== 1
      || enabled.some((config) => config.plugin !== "file" && config.plugin !== "comments")) reasons.push("Only file submissions and Moodle submission comments are supported");
    // File rules that do not depend on the chosen file, so the read-only
    // preview and the write workflow reject the same assignments.
    const fileConfig = new Map(assignment.configs
      .filter((config) => config.subtype === "assignsubmission" && config.plugin === "file")
      .map((config) => [config.name, config.value]));
    const maxFiles = Number(fileConfig.get("maxfilesubmissions"));
    const maxSize = Number(fileConfig.get("maxsubmissionsizebytes"));
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxSize) || maxSize <= 0) reasons.push("File limits are unavailable");
    const types = fileConfig.get("filetypeslist");
    if (typeof types !== "string" || types.trim() !== "") reasons.push("Assignments with restricted or unknown file types are not supported");
  }
  return reasons;
}
