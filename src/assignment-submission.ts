import { createHash, randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { MoodleClient } from "./moodle-client.js";
import type { SiteInfo } from "./types.js";
import { checkSubmissionEligibility, hasRelevantAssignmentWarnings } from "./submission-eligibility.js";

type FileInfo = { filename?: string; filesize?: number; fileurl?: string };
type Submission = { id?: number; userid?: number; assignment?: number; status?: string; plugins?: Array<{ type?: string; fileareas?: Array<{ files?: FileInfo[] }> }> };
type Status = { warnings?: unknown[]; lastattempt?: { submission?: Submission; canedit?: boolean; caneditowner?: boolean; cansubmit?: boolean; locked?: boolean; submissionsenabled?: boolean; teamsubmission?: unknown } };
type Assignment = Record<string, unknown> & { configs?: Array<{ subtype?: string; plugin?: string; name?: string; value?: string }> };
type Plan = { id: string; year: string; courseId: number; assignmentId: number; filename: string; bytes: Buffer; digest: string; expires: number; stage: "preview" | "busy" | "saved" | "done"; submissionId?: number; userId?: number; rules?: string; immediate?: boolean };
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function rulesFingerprint(assignment: Assignment): string {
  return digest(Buffer.from(JSON.stringify({ id: assignment.id, cmid: assignment.cmid, course: assignment.course, name: assignment.name,
    nosubmissions: assignment.nosubmissions, submissiondrafts: assignment.submissiondrafts,
    teamsubmission: assignment.teamsubmission, timelimit: assignment.timelimit,
    allowsubmissionsfromdate: assignment.allowsubmissionsfromdate, duedate: assignment.duedate,
    cutoffdate: assignment.cutoffdate, requiresubmissionstatement: assignment.requiresubmissionstatement,
    configs: assignment.configs })));
}

export class AssignmentSubmission {
  private readonly plans = new Map<string, Plan>();
  constructor(private readonly moodle: MoodleClient, private readonly auditDir: string) {}

  private async read(year: string, courseId: number, assignmentId: number) {
    const info = await this.moodle.call<SiteInfo>(year, "core_webservice_get_site_info");
    const functions = new Set(info.functions?.map(({ name }) => name));
    if (!Number.isSafeInteger(info.userid) || !functions.has("mod_assign_save_submission") || !functions.has("mod_assign_submit_for_grading")) throw new Error("Assignment write capabilities are unavailable");
    const listing = await this.moodle.call<{ courses?: Array<{ assignments?: Assignment[] }>; warnings?: unknown[] }>(year, "mod_assign_get_assignments", { courseids: [courseId] });
    const assignment = listing.courses?.flatMap((course) => course.assignments ?? []).find(({ id }) => id === assignmentId);
    if (!assignment) throw new Error("Assignment not found in the specified course");
    if (hasRelevantAssignmentWarnings(listing.warnings, assignment.cmid)) throw new Error("Assignment listing returned relevant or ambiguous warnings");
    const status = await this.moodle.call<Status>(year, "mod_assign_get_submission_status", { assignid: assignmentId });
    if (status.warnings?.length || !status.lastattempt) throw new Error("Submission state is unavailable or ambiguous");
    return { info, assignment, attempt: status.lastattempt };
  }

  private checkFile(assignment: Assignment, filename: string, size: number) {
    const values = new Map((assignment.configs ?? []).filter((c) => c.subtype === "assignsubmission" && c.plugin === "file").map((c) => [c.name, c.value]));
    const maxFiles = Number(values.get("maxfilesubmissions"));
    const maxSize = Number(values.get("maxsubmissionsizebytes"));
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxSize) || maxSize <= 0 || size > maxSize) throw new Error("File limits are unavailable or do not permit this file");
    const types = values.get("filetypeslist");
    if (typeof types !== "string" || types.trim() !== "") throw new Error("Assignments with restricted or unknown file types are not supported");
    if (!filename || filename.length > 200 || filename === "." || filename === ".." || /[\\/\x00-\x1f\x7f]/.test(filename)) throw new Error("Invalid filename");
    // Moodle stores dot-leading names but refuses to serve them (HTTP 403), so
    // the saved file could never be verified, or opened by the teacher.
    if (filename.startsWith(".")) throw new Error("Filenames starting with a dot are not supported: Moodle will not serve them back");
    if (assignment.requiresubmissionstatement !== 0) throw new Error("Assignments requiring a submission statement are not supported");
  }

  private validatePreview(plan: Plan, assignment: Assignment, attempt: Status["lastattempt"]) {
    if (!attempt) throw new Error("Submission state is unavailable");
    const reasons = checkSubmissionEligibility(assignment, attempt, { courseId: plan.courseId, assignmentId: plan.assignmentId, now: Math.floor(Date.now() / 1000), allowImmediate: true });
    if (reasons.length) throw new Error(`Assignment is not eligible: ${reasons.join("; ")}`);
    this.checkFile(assignment, plan.filename, plan.bytes.length);
  }

  async preview(year: string, courseId: number, assignmentId: number, filename: string, base64: string) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("File content must be canonical base64");
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString("base64") !== base64) throw new Error("File must contain 1 byte to 2 MiB");
    const plan: Plan = { id: randomUUID(), year, courseId, assignmentId, filename, bytes, digest: digest(bytes), expires: Date.now() + 10 * 60_000, stage: "preview" };
    const { info, assignment, attempt } = await this.read(year, courseId, assignmentId);
    this.validatePreview(plan, assignment, attempt);
    plan.userId = info.userid;
    plan.rules = rulesFingerprint(assignment);
    plan.immediate = assignment.submissiondrafts === 0;
    for (const [id, old] of this.plans) if (old.expires < Date.now()) this.plans.delete(id);
    if (this.plans.size >= 5) throw new Error("Too many active submission previews");
    this.plans.set(plan.id, plan);
    return { planId: plan.id, year, courseId, assignmentId, assignmentName: assignment.name, dueDate: assignment.duedate, cutoffDate: assignment.cutoffdate, filename, bytes: bytes.length, sha256: plan.digest, expiresAt: new Date(plan.expires).toISOString(), submissionMode: plan.immediate ? "save immediately submits for grading" : "draft with separate final submission", fileLimitBytes: MAX_FILE_BYTES, warning: plan.immediate ? "Saving this file submits it for grading immediately. Obtain explicit final-submission confirmation before proceeding." : "Saving uploads a draft to Campus. Obtain explicit user confirmation before saving. Final submission requires a separate confirmation." };
  }

  private get(id: string, stage: Plan["stage"]) {
    const plan = this.plans.get(id);
    if (!plan || plan.expires < Date.now() || plan.stage !== stage) throw new Error("Submission preview expired, was already used, or is in the wrong state");
    return plan;
  }

  private async claim(plan: Plan, action: string, key: string) {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new Error("Use a unique idempotency key of 16 to 100 letters, digits, underscores or hyphens");
    try {
      await mkdir(this.auditDir, { recursive: true, mode: 0o700 });
      const keyHash = digest(Buffer.from(`${plan.year}:${plan.assignmentId}:${action}:${key}`));
      const file = await open(path.join(this.auditDir, `${keyHash}.json`), "wx", 0o600);
      try { await file.writeFile(JSON.stringify({ action, keyHash, timestamp: new Date().toISOString() }) + "\n"); await file.sync(); } finally { await file.close(); }
    } catch {
      throw new Error("Unable to record the write attempt or the idempotency key was already used");
    }
  }

  private async verify(plan: Plan, expectedStatus: string) {
    const { info, assignment, attempt } = await this.read(plan.year, plan.courseId, plan.assignmentId);
    if (info.userid !== plan.userId || rulesFingerprint(assignment) !== plan.rules) throw new Error("Account or assignment rules changed; inspect Campus manually");
    if (typeof assignment.cutoffdate !== "number" || (assignment.cutoffdate !== 0 && assignment.cutoffdate <= Math.floor(Date.now() / 1000))) throw new Error("Assignment cutoff has passed or is unavailable");
    const submission = attempt.submission;
    if (!submission || submission.userid !== info.userid || submission.assignment !== plan.assignmentId || submission.status !== expectedStatus || (plan.submissionId !== undefined && submission.id !== plan.submissionId)) throw new Error("Submission identity or status does not match; inspect Campus manually");
    const files = (submission.plugins ?? []).filter((p) => p.type === "file").flatMap((p) => (p.fileareas ?? []).flatMap((a) => a.files ?? []));
    if (files.length !== 1 || files[0]?.filename !== plan.filename || files[0].filesize !== plan.bytes.length || !files[0].fileurl) throw new Error("Saved attachments differ from preview; inspect Campus manually");
    const downloaded = await this.moodle.fetchFile(plan.year, files[0].fileurl, MAX_FILE_BYTES);
    if (digest(downloaded.content) !== plan.digest) throw new Error("Saved file hash does not match preview; inspect Campus manually");
    return { submission, attempt };
  }

  async save(id: string, sha256: string, key: string, confirmation: string) {
    const plan = this.get(id, "preview");
    if (plan.immediate) throw new Error("This assignment submits immediately on save; use the separately confirmed direct-submit operation");
    if (confirmation !== "SAVE DRAFT" || sha256 !== plan.digest) throw new Error("Explicit SAVE DRAFT confirmation and matching file hash are required");
    plan.stage = "busy";
    try {
      const current = await this.read(plan.year, plan.courseId, plan.assignmentId);
      this.validatePreview(plan, current.assignment, current.attempt);
      if (current.info.userid !== plan.userId || rulesFingerprint(current.assignment) !== plan.rules) throw new Error("Account or assignment rules changed since preview");
      await this.claim(plan, "save-draft", key);
      const itemId = await this.moodle.uploadAssignmentFile(plan.year, plan.filename, plan.bytes, 0);
      const afterUpload = await this.read(plan.year, plan.courseId, plan.assignmentId);
      this.validatePreview(plan, afterUpload.assignment, afterUpload.attempt);
      if (afterUpload.info.userid !== plan.userId || rulesFingerprint(afterUpload.assignment) !== plan.rules) throw new Error("Account or assignment rules changed after upload");
      await this.moodle.saveAssignmentDraft(plan.year, plan.assignmentId, itemId);
      const verified = await this.verify(plan, "draft");
      if (!verified.submission.id) throw new Error("Saved submission has no ID; inspect Campus manually");
      plan.submissionId = verified.submission.id;
      plan.stage = "saved";
      return { planId: plan.id, submissionId: plan.submissionId, status: "draft", filename: plan.filename, sha256: plan.digest, verified: true, warning: "Draft saved. Final submission requires separate explicit confirmation." };
    } catch (error) {
      plan.stage = "done";
      throw new Error(`Save did not complete with verification. Do not retry automatically; inspect Campus first. ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async submitImmediate(id: string, sha256: string, key: string, confirmation: string) {
    const plan = this.get(id, "preview");
    if (!plan.immediate || confirmation !== "SUBMIT FOR GRADING" || sha256 !== plan.digest) throw new Error("Immediate-submission preview, matching hash and explicit SUBMIT FOR GRADING confirmation are required");
    plan.stage = "busy";
    try {
      let current = await this.read(plan.year, plan.courseId, plan.assignmentId);
      this.validatePreview(plan, current.assignment, current.attempt);
      if (current.info.userid !== plan.userId || rulesFingerprint(current.assignment) !== plan.rules) throw new Error("Account or assignment rules changed since preview");
      await this.claim(plan, "submit-on-save", key);
      const itemId = await this.moodle.uploadAssignmentFile(plan.year, plan.filename, plan.bytes, 0);
      current = await this.read(plan.year, plan.courseId, plan.assignmentId);
      this.validatePreview(plan, current.assignment, current.attempt);
      if (current.info.userid !== plan.userId || rulesFingerprint(current.assignment) !== plan.rules) throw new Error("Account or assignment rules changed after upload");
      await this.moodle.saveAssignmentDraft(plan.year, plan.assignmentId, itemId);
      const verified = await this.verify(plan, "submitted");
      if (!verified.submission.id) throw new Error("Submission has no ID; inspect Campus manually");
      plan.stage = "done";
      return { planId: plan.id, submissionId: verified.submission.id, status: "submitted", filename: plan.filename, sha256: plan.digest, verified: true };
    } catch (error) {
      plan.stage = "done";
      throw new Error(`Direct submission did not complete with verification. Do not retry automatically; inspect Campus first. ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async submit(id: string, sha256: string, key: string, confirmation: string) {
    const plan = this.get(id, "saved");
    if (confirmation !== "SUBMIT FOR GRADING" || sha256 !== plan.digest) throw new Error("Explicit SUBMIT FOR GRADING confirmation and matching file hash are required");
    plan.stage = "busy";
    try {
      const before = await this.verify(plan, "draft");
      if (before.attempt.cansubmit !== true || before.attempt.locked !== false || before.attempt.submissionsenabled !== true) throw new Error("Moodle does not confirm the draft can be submitted");
      await this.claim(plan, "submit-for-grading", key);
      await this.moodle.submitAssignment(plan.year, plan.assignmentId);
      await this.verify(plan, "submitted");
      plan.stage = "done";
      return { planId: plan.id, submissionId: plan.submissionId, status: "submitted", filename: plan.filename, sha256: plan.digest, verified: true };
    } catch (error) {
      plan.stage = "done";
      throw new Error(`Final submission did not complete with verification. Do not retry automatically; inspect Campus first. ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
