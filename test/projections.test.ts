import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCUSSION_TEXT_LIMIT,
  LIST_TEXT_LIMIT,
  projectAssignment,
  projectAssignmentList,
  projectAssignmentStatus,
  projectDiscussions,
  projectForums,
  projectNotifications,
  projectPosts,
  projectQuizzes,
  warningsForAssignment,
} from "../src/projections.js";

const configs = [
  { plugin: "file", subtype: "assignsubmission", name: "enabled", value: "1" },
  { plugin: "file", subtype: "assignsubmission", name: "maxfilesubmissions", value: "2" },
  { plugin: "file", subtype: "assignsubmission", name: "maxsubmissionsizebytes", value: "10485760" },
  { plugin: "file", subtype: "assignsubmission", name: "filetypeslist", value: ".pdf,.zip" },
  { plugin: "onlinetext", subtype: "assignsubmission", name: "enabled", value: "1" },
  { plugin: "onlinetext", subtype: "assignsubmission", name: "wordlimitenabled", value: "1" },
  { plugin: "onlinetext", subtype: "assignsubmission", name: "wordlimit", value: "500" },
  { plugin: "comments", subtype: "assignsubmission", name: "enabled", value: "1" },
  { plugin: "editpdf", subtype: "assignfeedback", name: "enabled", value: "1" },
];

const rawAssignment = {
  id: 6146,
  cmid: 55257,
  course: 1071,
  name: "Costs &amp; Benefits",
  nosubmissions: 0,
  submissiondrafts: 1,
  sendnotifications: 0,
  duedate: 1795795200,
  allowsubmissionsfromdate: 1794585600,
  cutoffdate: 1795881600,
  gradingduedate: 0,
  grade: 10,
  timemodified: 1794576358,
  teamsubmission: 1,
  requireallteammemberssubmit: 0,
  blindmarking: 0,
  maxattempts: -1,
  attemptreopenmethod: "manual",
  requiresubmissionstatement: 0,
  preventsubmissionnotingroup: 1,
  configs,
  intro: `<p>${"Long instructions. ".repeat(40)}</p>`,
  introformat: 1,
  introfiles: [],
  introattachments: [{
    filename: "main.c",
    filepath: "/",
    filesize: 5382,
    fileurl: "https://e-aules.uab.cat/2026-27/webservice/pluginfile.php/1/mod_assign/introattachment/0/main.c",
    mimetype: "text/plain",
    timemodified: 1785403244,
    icon: "f/sourcecode",
  }],
  timelimit: 0,
};

test("projectAssignment keeps rules and full text, drops decoration", () => {
  const assignment = projectAssignment(rawAssignment);
  assert.equal(assignment.name, "Costs & Benefits");
  assert.equal(assignment.teamsubmission, true);
  assert.equal(assignment.submissiondrafts, true);
  assert.equal(assignment.cutoffdate, 1795881600);
  assert.deepEqual(assignment.submission, {
    types: ["file", "onlinetext"],
    file: { maxFiles: 2, maxSizeBytes: 10485760, acceptedTypes: [".pdf", ".zip"] },
    onlinetext: { wordLimit: 500 },
  });
  assert.equal(assignment.introTruncated, undefined);
  assert.match(String(assignment.intro), /^Long instructions\./);
  assert.ok(!String(assignment.intro).includes("<p>"));
  assert.deepEqual(assignment.introattachments, [
    { filename: "main.c", filesize: 5382, mimetype: "text/plain", timemodified: 1785403244, fileIndex: 0 },
  ]);
  for (const dropped of ["configs", "introformat", "introfiles", "sendnotifications", "blindmarking"]) {
    assert.equal(dropped in assignment, false, dropped);
  }
});

test("projectAssignmentList truncates intros and counts hidden modules", () => {
  const list = projectAssignmentList({
    courses: [{ id: 1071, fullname: "A &amp; B", shortname: "AB", timemodified: 1, assignments: [rawAssignment] }],
    warnings: [
      { item: "module", itemid: 1, warningcode: "1", message: "No access rights in module context" },
      { item: "module", itemid: 2, warningcode: "1", message: "No access rights in module context" },
      { item: "course", itemid: 9, warningcode: "2", message: "User is not enrolled" },
    ],
  });
  assert.equal(list.hiddenAssignmentCount, 2);
  assert.deepEqual(list.warnings, [
    { item: "course", itemid: 9, warningcode: "2", message: "User is not enrolled" },
  ]);
  const courses = list.courses as Array<Record<string, unknown>>;
  assert.equal(courses[0]?.fullname, "A & B");
  const [summary] = courses[0]?.assignments as Array<Record<string, unknown>>;
  assert.ok(summary);
  assert.equal(summary.introTruncated, true);
  assert.ok(String(summary.intro).length <= LIST_TEXT_LIMIT + 1);
  assert.deepEqual(summary.introattachments, ["main.c"]);
  assert.equal(summary.id, 6146);
  assert.equal(summary.cmid, 55257);
  assert.equal("gradingduedate" in summary, false);
});

test("warningsForAssignment keeps only the requested assignment", () => {
  const warnings = [
    { item: "module", itemid: 55257, warningcode: "1", message: "This one" },
    { item: "module", itemid: 99999, warningcode: "1", message: "Other assignment" },
  ];
  assert.deepEqual(warningsForAssignment(warnings, rawAssignment), [warnings[0]]);
  assert.deepEqual(warningsForAssignment(undefined, rawAssignment), []);
});

test("projectAssignmentStatus summarizes submission, feedback, and attachments", () => {
  const status = projectAssignmentStatus({
    lastattempt: {
      submission: {
        id: 1,
        userid: 7,
        attemptnumber: 0,
        timecreated: 10,
        timemodified: 20,
        status: "submitted",
        groupid: 0,
        plugins: [
          {
            type: "file",
            name: "File submissions",
            fileareas: [{ area: "submission_files", files: [{ filename: "report.pdf", filesize: 9, mimetype: "application/pdf", fileurl: "https://x/y", icon: "f/pdf" }] }],
          },
          { type: "onlinetext", name: "Online text", editorfields: [{ name: "onlinetext", text: "<p>My <b>answer</b></p>", format: 1 }] },
          { type: "comments", name: "Submission comments" },
        ],
      },
      submissionsenabled: true,
      locked: false,
      graded: true,
      canedit: false,
      cansubmit: false,
      extensionduedate: null,
      gradingstatus: "graded",
      usergroups: [],
    },
    feedback: {
      grade: { id: 3, grade: "8.50000", timemodified: 30 },
      gradefordisplay: "<span>8,50&nbsp;/&nbsp;10,00</span>",
      gradeddate: 30,
      plugins: [
        { type: "comments", name: "Feedback comments", editorfields: [{ name: "comments", text: "<p>Well done</p>", format: 1 }] },
      ],
    },
    assignmentdata: {
      attachments: { intro: [{ filename: "brief.pdf", filesize: 1, mimetype: "application/pdf", fileurl: "https://x" }] },
      activity: "<p>Upload one PDF.</p>",
    },
    warnings: [],
  });
  assert.deepEqual(status.lastattempt, {
    submission: {
      id: 1,
      status: "submitted",
      attemptnumber: 0,
      groupid: 0,
      timecreated: 10,
      timemodified: 20,
      files: [{ filename: "report.pdf", filesize: 9, mimetype: "application/pdf", pluginIndex: 0, areaIndex: 0, fileIndex: 0 }],
      onlinetext: "My answer",
    },
    submissionsenabled: true,
    locked: false,
    graded: true,
    canedit: false,
    cansubmit: false,
    extensionduedate: null,
    gradingstatus: "graded",
    usergroups: [],
  });
  assert.deepEqual(status.feedback, {
    grade: "8.50000",
    gradefordisplay: "8,50\u00a0/\u00a010,00",
    gradeddate: 30,
    comments: "Well done",
    files: [],
  });
  assert.deepEqual(status.assignmentdata, {
    introattachments: [{ filename: "brief.pdf", filesize: 1, mimetype: "application/pdf", fileIndex: 0 }],
    activity: "Upload one PDF.",
  });
});

test("projectNotifications keeps one text form and the course ID", () => {
  const result = projectNotifications({
    unreadcount: 3,
    notifications: [{
      id: 5,
      useridfrom: 1,
      useridto: 2,
      subject: "Canvis a A &amp; B",
      shortenedsubject: "Canvis",
      text: "<p>Hi ha canvis</p>",
      fullmessage: "Hi ha canvis [1]",
      fullmessageformat: 1,
      fullmessagehtml: "<p>Hi ha canvis a <a href=\"https://e-aules.uab.cat/2026-27/mod/assign/view.php?id=1\">Tasca</a></p>",
      smallmessage: "Hi ha canvis",
      contexturl: "https://e-aules.uab.cat/2026-27/mod/assign/view.php?id=1",
      contexturlname: "Tasca",
      timecreated: 100,
      timecreatedpretty: "Fa 1 dia",
      timeread: null,
      read: false,
      deleted: false,
      iconurl: "https://e-aules.uab.cat/icon",
      component: "moodle",
      eventtype: "coursecontentupdated",
      customdata: "{\"notificationiconurl\":\"https://x\",\"courseid\":\"3593\"}",
    }],
  });
  assert.deepEqual(result, {
    unreadcount: 3,
    notifications: [{
      id: 5,
      subject: "Canvis a A & B",
      text: "Hi ha canvis a Tasca",
      courseid: 3593,
      contexturl: "https://e-aules.uab.cat/2026-27/mod/assign/view.php?id=1",
      contexturlname: "Tasca",
      component: "moodle",
      eventtype: "coursecontentupdated",
      timecreated: 100,
      read: false,
    }],
  });
});

test("forum projections keep IDs, authors, and text without decoration", () => {
  const [forum] = projectForums([{
    id: 3006, cmid: 1, course: 1071, type: "news", name: "Avisos &amp; Notes", intro: "<p>News</p>",
    introformat: 1, introfiles: [], lang: "", rsstype: 0, numdiscussions: 4, cancreatediscussions: false,
    istracked: false, duedate: 0, cutoffdate: 0,
  }]);
  assert.deepEqual(forum, {
    id: 3006, cmid: 1, course: 1071, type: "news", name: "Avisos & Notes", intro: "News",
    numdiscussions: 4, istracked: false, cancreatediscussions: false, duedate: 0, cutoffdate: 0,
  });

  const longMessage = `<p>${"word ".repeat(400)}</p>`;
  const { discussions } = projectDiscussions({
    discussions: [{
      id: 17948, name: "1st Exam", subject: "1st Exam", discussion: 13431, userid: 3430,
      userfullname: "Teacher", userpictureurl: "https://x/pic", created: 1, modified: 2, timemodified: 2,
      timestart: 0, timeend: 0, groupid: -1, numreplies: 0, numunread: 1, pinned: false, locked: false,
      starred: false, canreply: false, message: longMessage, messageformat: 1, attachment: true,
      attachments: [{ filename: "a.pdf", filesize: 3, mimetype: "application/pdf", fileurl: "https://x" }],
    }],
    warnings: [],
  }) as { discussions: Array<Record<string, unknown>> };
  const [discussion] = discussions;
  assert.ok(discussion);
  assert.equal(discussion.discussion, 13431);
  assert.equal(discussion.author, "Teacher");
  assert.equal(discussion.messageTruncated, true);
  assert.ok(String(discussion.message).length <= DISCUSSION_TEXT_LIMIT + 1);
  assert.equal("subject" in discussion, false);
  assert.equal("userpictureurl" in discussion, false);
  assert.equal("timestart" in discussion, false);
  assert.deepEqual(discussion.attachments, [{ filename: "a.pdf", filesize: 3, mimetype: "application/pdf" }]);

  const [post] = projectPosts([{
    id: 17948, subject: "1st Exam", replysubject: "Re: 1st Exam", message: longMessage, messageformat: 1,
    author: { id: 3430, fullname: "Teacher", urls: { profileimage: "https://x" }, groups: [] },
    discussionid: 13431, hasparent: false, parentid: null, timecreated: 1, timemodified: 1, unread: null,
    isdeleted: false, isprivatereply: false, capabilities: { reply: false }, urls: { view: "https://x" },
    attachments: [], html: { authorsubheading: "<a>Teacher</a>" },
  }]);
  assert.ok(post);
  assert.deepEqual(post.author, { id: 3430, fullname: "Teacher" });
  assert.equal(post.parentid, null);
  assert.equal(post.messageTruncated, undefined);
  assert.equal(String(post.message).length, "word ".repeat(400).trim().length);
  for (const dropped of ["capabilities", "urls", "html", "replysubject", "isdeleted", "isprivatereply"]) {
    assert.equal(dropped in post, false, dropped);
  }
});

test("projectQuizzes converts intro HTML and names the grade method", () => {
  const { quizzes } = projectQuizzes({
    quizzes: [{
      id: 4037, coursemodule: 93641, course: 1955, name: "Unit 1 &amp; 2", intro: "<p>Five questions.</p>",
      introformat: 1, introfiles: [], lang: "", timeopen: 1, timeclose: 2, timelimit: 7200, attempts: 2,
      grademethod: 1, grade: 10,
    }],
    warnings: [],
  }) as { quizzes: Array<Record<string, unknown>> };
  assert.deepEqual(quizzes[0], {
    id: 4037, coursemodule: 93641, course: 1955, name: "Unit 1 & 2", timeopen: 1, timeclose: 2,
    timelimit: 7200, attempts: 2, grademethod: 1, grade: 10, grademethodname: "highest",
    intro: "Five questions.",
  });
});

test("assignment status submission files keep download indexes", async () => {
  const { projectAssignmentStatus } = await import("../src/projections.js");
  const status = projectAssignmentStatus({
    lastattempt: {
      submission: {
        id: 7, status: "submitted",
        plugins: [
          { type: "onlinetext", fileareas: [{ area: "submissions_onlinetext", files: [] }] },
          { type: "file", fileareas: [{ area: "submission_files", files: [
            { filename: "a.zip", filesize: 10, fileurl: "https://e-aules.uab.cat/x" },
            { filename: "b.pdf", filesize: 20, fileurl: "https://e-aules.uab.cat/y" },
          ] }] },
        ],
      },
    },
  }) as { lastattempt: { submission: { files: Array<Record<string, unknown>> } } };
  const files = status.lastattempt.submission.files;
  assert.deepEqual(files.map((f) => [f.filename, f.pluginIndex, f.areaIndex, f.fileIndex]), [["a.zip", 1, 0, 0], ["b.pdf", 1, 0, 1]]);
  assert.equal("fileurl" in files[0]!, false);
});
