import { decodeEntities, htmlToText } from "./text.js";

/**
 * Curated projections of verbose Moodle responses. Each keeps what an agent
 * needs to act and to chain IDs into other tools, and drops decoration
 * (picture URLs, icon paths, capability maps, duplicate message formats).
 * Moodle field names are kept where a field is copied unchanged.
 */

type Row = Record<string, unknown>;

/** Maximum characters of descriptive text kept per item in list tools. */
export const LIST_TEXT_LIMIT = 300;
/** Discussion rows carry the announcement body, so they keep a longer excerpt. */
export const DISCUSSION_TEXT_LIMIT = 1000;

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function flag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const number = num(value);
  return number === undefined ? undefined : number !== 0;
}

/** Remove undefined values so the projection serializes the same everywhere. */
function compact<T extends Row>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function pick(source: Row, keys: readonly string[]): Row {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function truncate(text: string | undefined, limit: number | undefined): { text?: string; truncated?: true } {
  if (text === undefined) return {};
  if (limit === undefined || text.length <= limit) return { text };
  return { text: `${text.slice(0, limit).trimEnd()}…`, truncated: true };
}

/** Text of an HTML field, optionally limited, as `{ [key], [key]Truncated }`. */
function textField(key: string, html: unknown, limit?: number): Row {
  const { text, truncated } = truncate(htmlToText(str(html)), limit);
  return compact({ [key]: text, [`${key}Truncated`]: truncated });
}

export type FileSummary = {
  filename?: string | undefined;
  filesize?: number | undefined;
  mimetype?: string | undefined;
  timemodified?: number | undefined;
};

export function projectFiles(value: unknown): FileSummary[] {
  return rows(value).map((file) => compact({
    filename: str(file.filename),
    filesize: num(file.filesize),
    mimetype: str(file.mimetype),
    timemodified: num(file.timemodified),
  }));
}

/** Number files by their Moodle position, as campus_read_assignment_attachment expects. */
export function withFileIndex<T extends object>(files: T[]): Array<T & { fileIndex: number }> {
  return files.map((file, fileIndex) => ({ ...file, fileIndex }));
}

function warnings(value: unknown): Row[] {
  return rows(value).map((warning) => pick(warning, ["item", "itemid", "warningcode", "message"]));
}

// ---------------------------------------------------------------- assignments

function assignmentConfig(configs: unknown, subtype: string, plugin: string, name: string) {
  return rows(configs)
    .find((config) => config.subtype === subtype && config.plugin === plugin && config.name === name)
    ?.value;
}

/** Submission plugins and the limits a student must respect. */
export function projectSubmissionRules(configs: unknown): Row {
  const enabled = (plugin: string) =>
    flag(assignmentConfig(configs, "assignsubmission", plugin, "enabled")) === true;
  const types = [...new Set(rows(configs)
    .filter((config) => config.subtype === "assignsubmission" && config.name === "enabled"
      && flag(config.value) === true && config.plugin !== "comments")
    .map((config) => String(config.plugin)))];
  const rules: Row = { types };
  if (enabled("file")) {
    const accepted = str(assignmentConfig(configs, "assignsubmission", "file", "filetypeslist")) ?? "";
    rules.file = compact({
      maxFiles: num(assignmentConfig(configs, "assignsubmission", "file", "maxfilesubmissions")),
      maxSizeBytes: num(assignmentConfig(configs, "assignsubmission", "file", "maxsubmissionsizebytes")),
      acceptedTypes: accepted.split(/[\s,;]+/).filter(Boolean),
    });
  }
  if (enabled("onlinetext")) {
    const limitEnabled = flag(assignmentConfig(configs, "assignsubmission", "onlinetext", "wordlimitenabled"));
    rules.onlinetext = compact({
      wordLimit: limitEnabled ? num(assignmentConfig(configs, "assignsubmission", "onlinetext", "wordlimit")) : undefined,
    });
  }
  return rules;
}

/**
 * One assignment. `textLimit` truncates the intro and activity text (list
 * tools); omit it to keep full text (detail tools).
 */
export function projectAssignment(assignment: Row, textLimit?: number): Row {
  return compact({
    id: num(assignment.id),
    cmid: num(assignment.cmid),
    course: num(assignment.course),
    name: decodeEntities(str(assignment.name)),
    allowsubmissionsfromdate: num(assignment.allowsubmissionsfromdate),
    duedate: num(assignment.duedate),
    cutoffdate: num(assignment.cutoffdate),
    gradingduedate: num(assignment.gradingduedate),
    timemodified: num(assignment.timemodified),
    grade: num(assignment.grade),
    nosubmissions: flag(assignment.nosubmissions),
    submissiondrafts: flag(assignment.submissiondrafts),
    requiresubmissionstatement: flag(assignment.requiresubmissionstatement),
    teamsubmission: flag(assignment.teamsubmission),
    requireallteammemberssubmit: flag(assignment.requireallteammemberssubmit),
    preventsubmissionnotingroup: flag(assignment.preventsubmissionnotingroup),
    maxattempts: num(assignment.maxattempts),
    attemptreopenmethod: str(assignment.attemptreopenmethod),
    timelimit: num(assignment.timelimit),
    submission: projectSubmissionRules(assignment.configs),
    ...textField("intro", assignment.intro, textLimit),
    ...textField("activity", assignment.activity, textLimit),
    introattachments: withFileIndex(projectFiles(assignment.introattachments)),
  });
}

const assignmentSummaryKeys = [
  "id", "cmid", "course", "name", "allowsubmissionsfromdate", "duedate", "cutoffdate", "grade",
  "teamsubmission", "maxattempts", "submission", "intro", "introTruncated", "activity", "activityTruncated",
] as const;

/**
 * List-level assignment: IDs, dates, grade, team flag, attempts, submission
 * rules, a short intro, and attachment names. Full detail lives in
 * `projectAssignment`.
 */
export function projectAssignmentSummary(assignment: Row): Row {
  const full = projectAssignment(assignment, LIST_TEXT_LIMIT);
  const attachments = projectFiles(assignment.introattachments).map(({ filename }) => filename);
  return compact({
    ...pick(full, assignmentSummaryKeys),
    introattachments: attachments.length > 0 ? attachments : undefined,
  });
}

/** Moodle reports each hidden or inaccessible assignment module as one warning. */
function isHiddenModuleWarning(warning: Row): boolean {
  return warning.item === "module";
}

export function projectAssignmentList(result: unknown): Row {
  const source = isRow(result) ? result : {};
  const allWarnings = warnings(source.warnings);
  return {
    courses: rows(source.courses).map((course) => compact({
      id: num(course.id),
      shortname: decodeEntities(str(course.shortname)),
      fullname: decodeEntities(str(course.fullname)),
      assignments: rows(course.assignments).map(projectAssignmentSummary),
    })),
    hiddenAssignmentCount: allWarnings.filter(isHiddenModuleWarning).length,
    warnings: allWarnings.filter((warning) => !isHiddenModuleWarning(warning)),
  };
}

/** Only warnings about the requested assignment (by instance or module ID). */
export function warningsForAssignment(value: unknown, assignment: Row): Row[] {
  const ids = new Set([num(assignment.id), num(assignment.cmid)].filter((id) => id !== undefined));
  return warnings(value).filter((warning) => {
    const itemId = num(warning.itemid);
    return itemId !== undefined && ids.has(itemId);
  });
}

function projectSubmission(submission: unknown): Row | undefined {
  if (!isRow(submission)) return undefined;
  const plugins = rows(submission.plugins);
  // Keep Moodle's plugin/area/file positions so campus_download_submission_file
  // can be called with exactly these indexes.
  const files = plugins.flatMap((plugin, pluginIndex) => rows(plugin.fileareas)
    .flatMap((area, areaIndex) => projectFiles(area.files)
      .map((file, fileIndex) => ({ ...file, pluginIndex, areaIndex, fileIndex }))));
  const onlinetext = plugins
    .filter((plugin) => plugin.type === "onlinetext")
    .flatMap((plugin) => rows(plugin.editorfields))
    .map((field) => htmlToText(str(field.text)))
    .filter((text): text is string => text !== undefined)
    .join("\n\n");
  return compact({
    id: num(submission.id),
    status: str(submission.status),
    attemptnumber: num(submission.attemptnumber),
    groupid: num(submission.groupid),
    timecreated: num(submission.timecreated),
    timemodified: num(submission.timemodified),
    timestarted: num(submission.timestarted),
    files,
    onlinetext: onlinetext || undefined,
  });
}

function projectFeedback(feedback: unknown): Row | undefined {
  if (!isRow(feedback)) return undefined;
  const plugins = rows(feedback.plugins);
  const comments = plugins
    .flatMap((plugin) => rows(plugin.editorfields))
    .map((field) => htmlToText(str(field.text)))
    .filter((text): text is string => text !== undefined)
    .join("\n\n");
  const grade = isRow(feedback.grade) ? feedback.grade : {};
  return compact({
    grade: str(grade.grade) ?? num(grade.grade),
    gradefordisplay: htmlToText(str(feedback.gradefordisplay)),
    gradeddate: num(feedback.gradeddate),
    comments: comments || undefined,
    files: plugins.flatMap((plugin) => rows(plugin.fileareas)).flatMap((area) => projectFiles(area.files)),
  });
}

const lastAttemptScalars = [
  "submissiongroup", "submissiongroupmemberswhoneedtosubmit", "submissionsenabled", "locked", "graded",
  "canedit", "caneditowner", "cansubmit", "extensionduedate", "timelimit", "blindmarking",
  "gradingstatus", "usergroups",
] as const;

export function projectAssignmentStatus(result: unknown): Row {
  const source = isRow(result) ? result : {};
  const lastattempt = isRow(source.lastattempt) ? source.lastattempt : undefined;
  const assignmentdata = isRow(source.assignmentdata) ? source.assignmentdata : {};
  const attachments = isRow(assignmentdata.attachments) ? assignmentdata.attachments : {};
  return compact({
    lastattempt: lastattempt && compact({
      submission: projectSubmission(lastattempt.submission),
      teamsubmission: projectSubmission(lastattempt.teamsubmission),
      ...pick(lastattempt, lastAttemptScalars),
    }),
    feedback: projectFeedback(source.feedback),
    previousattempts: Array.isArray(source.previousattempts)
      ? rows(source.previousattempts).map((attempt) => compact({
        attemptnumber: num(attempt.attemptnumber),
        submission: projectSubmission(attempt.submission),
        grade: isRow(attempt.grade) ? str(attempt.grade.grade) ?? num(attempt.grade.grade) : undefined,
        feedbackcomments: rows(attempt.feedbackplugins)
          .flatMap((plugin) => rows(plugin.editorfields))
          .map((field) => htmlToText(str(field.text)))
          .filter((text): text is string => text !== undefined)
          .join("\n\n") || undefined,
      }))
      : undefined,
    assignmentdata: compact({
      introattachments: withFileIndex(projectFiles(attachments.intro)),
      ...textField("activity", assignmentdata.activity),
    }),
    warnings: warnings(source.warnings),
  });
}

// -------------------------------------------------------------- notifications

function customCourseId(customdata: unknown): number | undefined {
  if (typeof customdata !== "string" || customdata === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(customdata);
    return isRow(parsed) ? num(parsed.courseid) : undefined;
  } catch {
    return undefined;
  }
}

/** Link targets are noise here: `contexturl` already carries the relevant one. */
function withoutLinks(html: unknown): string | undefined {
  return str(html)?.replace(/<\/?a\b[^>]*>/gi, "");
}

export function projectNotification(notification: Row): Row {
  const body = htmlToText(withoutLinks(notification.fullmessagehtml))
    ?? str(notification.fullmessage)?.trim()
    ?? htmlToText(withoutLinks(notification.text))
    ?? str(notification.smallmessage);
  const { text, truncated } = truncate(body || undefined, LIST_TEXT_LIMIT);
  return compact({
    id: num(notification.id),
    subject: decodeEntities(str(notification.subject)),
    text,
    textTruncated: truncated,
    courseid: customCourseId(notification.customdata),
    contexturl: str(notification.contexturl),
    contexturlname: decodeEntities(str(notification.contexturlname)),
    component: str(notification.component),
    eventtype: str(notification.eventtype),
    timecreated: num(notification.timecreated),
    read: flag(notification.read),
    timeread: num(notification.timeread),
  });
}

export function projectNotifications(result: unknown): Row {
  const source = isRow(result) ? result : {};
  return compact({
    unreadcount: num(source.unreadcount),
    notifications: rows(source.notifications).map(projectNotification),
  });
}

// --------------------------------------------------------------------- forums

export function projectForum(forum: Row): Row {
  return compact({
    id: num(forum.id),
    cmid: num(forum.cmid),
    course: num(forum.course),
    type: str(forum.type),
    name: decodeEntities(str(forum.name)),
    ...textField("intro", forum.intro, LIST_TEXT_LIMIT),
    numdiscussions: num(forum.numdiscussions),
    unreadpostscount: num(forum.unreadpostscount),
    istracked: flag(forum.istracked),
    cancreatediscussions: flag(forum.cancreatediscussions),
    duedate: num(forum.duedate),
    cutoffdate: num(forum.cutoffdate),
    lockdiscussionafter: num(forum.lockdiscussionafter),
    assessed: num(forum.assessed),
    grade_forum: num(forum.grade_forum),
    maxattachments: num(forum.maxattachments),
    maxbytes: num(forum.maxbytes),
  });
}

export function projectForums(value: unknown): Row[] {
  return rows(value).map(projectForum);
}

export function projectDiscussion(discussion: Row): Row {
  const name = decodeEntities(str(discussion.name));
  const subject = decodeEntities(str(discussion.subject));
  return compact({
    discussion: num(discussion.discussion),
    id: num(discussion.id),
    name,
    subject: subject !== name ? subject : undefined,
    userid: num(discussion.userid),
    author: decodeEntities(str(discussion.userfullname)),
    created: num(discussion.created),
    modified: num(discussion.modified),
    timemodified: num(discussion.timemodified),
    timestart: num(discussion.timestart) || undefined,
    timeend: num(discussion.timeend) || undefined,
    groupid: num(discussion.groupid),
    numreplies: num(discussion.numreplies),
    numunread: num(discussion.numunread),
    pinned: flag(discussion.pinned),
    locked: flag(discussion.locked),
    starred: flag(discussion.starred),
    ...textField("message", discussion.message, DISCUSSION_TEXT_LIMIT),
    attachments: projectFiles(discussion.attachments),
  });
}

export function projectDiscussions(result: unknown): Row {
  const source = isRow(result) ? result : {};
  return {
    discussions: rows(source.discussions).map(projectDiscussion),
    warnings: warnings(source.warnings),
  };
}

export function projectPost(post: Row): Row {
  const author = isRow(post.author) ? post.author : {};
  return compact({
    id: num(post.id),
    discussionid: num(post.discussionid),
    parentid: num(post.parentid) ?? null,
    subject: decodeEntities(str(post.subject)),
    author: compact({ id: num(author.id), fullname: decodeEntities(str(author.fullname)) }),
    timecreated: num(post.timecreated),
    timemodified: num(post.timemodified),
    unread: flag(post.unread),
    isprivatereply: flag(post.isprivatereply) || undefined,
    isdeleted: flag(post.isdeleted) || undefined,
    ...textField("message", post.message),
    attachments: projectFiles(post.attachments),
  });
}

export function projectPosts(value: unknown): Row[] {
  return rows(value).map(projectPost);
}

// -------------------------------------------------------------------- quizzes

const quizGradeMethods: Record<number, string> = { 1: "highest", 2: "average", 3: "first", 4: "last" };
const droppedQuizFields = new Set(["intro", "introformat", "introfiles", "lang"]);

/** Quizzes are already compact; only the intro HTML is converted and shortened. */
export function projectQuiz(quiz: Row): Row {
  const kept = Object.fromEntries(Object.entries(quiz).filter(([key]) => !droppedQuizFields.has(key)));
  const grademethod = num(quiz.grademethod);
  return compact({
    ...kept,
    name: decodeEntities(str(quiz.name)),
    grademethodname: grademethod === undefined ? undefined : quizGradeMethods[grademethod],
    ...textField("intro", quiz.intro, LIST_TEXT_LIMIT),
  });
}

export function projectQuizzes(result: unknown): Row {
  const source = isRow(result) ? result : {};
  return {
    quizzes: rows(source.quizzes).map(projectQuiz),
    warnings: warnings(source.warnings),
  };
}
