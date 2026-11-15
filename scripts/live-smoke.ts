import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

function inheritedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function dataOf(result: { structuredContent?: unknown }): Record<string, unknown> {
  const structured = result.structuredContent;
  if (!structured || typeof structured !== "object" || !("data" in structured)) {
    throw new Error("MCP tool returned no structured data");
  }
  const data = structured.data;
  if (!data || typeof data !== "object") throw new Error("MCP tool returned invalid data");
  return data as Record<string, unknown>;
}

const client = new Client({ name: "uab-campus-mcp-live-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/index.js")],
  cwd: process.cwd(),
  env: inheritedEnvironment(),
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const authentication = dataOf(await client.callTool({
    name: "campus_auth_status",
    arguments: {},
  }));
  if (authentication.status !== "ok") {
    throw new Error("Authentication diagnostics did not pass");
  }

  const yearsResult = dataOf(await client.callTool({ name: "campus_list_years", arguments: {} }));
  const years = yearsResult.years;
  if (!Array.isArray(years) || !years.every((year) => typeof year === "string")) {
    throw new Error("No academic years were returned");
  }

  const summaries = [];
  for (const year of years) {
    const profile = dataOf(await client.callTool({
      name: "campus_get_profile",
      arguments: { year },
    }));
    const courses = dataOf(await client.callTool({
      name: "campus_list_courses",
      arguments: { year },
    }));
    const yearRows = courses.years;
    const courseCount = Array.isArray(yearRows)
      && yearRows[0]
      && typeof yearRows[0] === "object"
      && "courses" in yearRows[0]
      && Array.isArray(yearRows[0].courses)
      ? yearRows[0].courses.length
      : 0;
    const capabilityCount = Array.isArray(profile.readOnlyCapabilities)
      ? profile.readOnlyCapabilities.length
      : 0;
    summaries.push({ year, courseCount, capabilityCount });
  }

  const currentYear = years.at(-1);
  if (!currentYear) throw new Error("No current academic year is available");
  const currentCourses = dataOf(await client.callTool({
    name: "campus_list_courses",
    arguments: { year: currentYear },
  }));
  const yearRows = currentCourses.years;
  const courses = Array.isArray(yearRows)
    && yearRows[0]
    && typeof yearRows[0] === "object"
    && "courses" in yearRows[0]
    && Array.isArray(yearRows[0].courses)
    ? yearRows[0].courses as Array<Record<string, unknown>>
    : [];
  const courseId = courses.find(({ id }) => typeof id === "number")?.id;
  if (typeof courseId !== "number") throw new Error("No current course ID is available");
  const courseIds = courses.flatMap(({ id }) => typeof id === "number" ? [id] : []);

  const courseMatches = dataOf(await client.callTool({
    name: "campus_find_courses",
    arguments: { year: currentYear, query: String(courseId) },
  }));
  const resources = dataOf(await client.callTool({
    name: "campus_list_resources",
    arguments: { year: currentYear, courseId },
  }));
  const resourceRows = Array.isArray(resources.resources)
    ? resources.resources as Array<Record<string, unknown>>
    : [];
  const readableFile = resourceRows.flatMap((resource) => {
    if (typeof resource.moduleId !== "number" || !Array.isArray(resource.files)) return [];
    return (resource.files as Array<Record<string, unknown>>).flatMap((file) =>
      typeof file.fileIndex === "number"
      && typeof file.filesize === "number"
      && file.filesize <= 10 * 1024 * 1024
      && (file.mimetype === "application/pdf" || file.mimetype === "text/plain")
        ? [{ moduleId: resource.moduleId as number, fileIndex: file.fileIndex }]
        : []);
  })[0];
  if (!readableFile) throw new Error("No bounded readable course resource is available");
  const resourceText = dataOf(await client.callTool({
    name: "campus_read_resource",
    arguments: {
      year: currentYear,
      courseId,
      ...readableFile,
      maxChars: 10_000,
      maxPdfPages: 2,
    },
  }));
  if (resourceText.readable !== true || typeof resourceText.text !== "string") {
    throw new Error("Live course resource did not produce readable text");
  }
  const originalResource = dataOf(await client.callTool({
    name: "campus_download_resource",
    arguments: { year: currentYear, courseId, ...readableFile, maxBytes: 10 * 1024 * 1024 },
  }));
  if (typeof originalResource.content !== "string" || typeof originalResource.bytes !== "number"
    || Buffer.from(originalResource.content, "base64").length !== originalResource.bytes) {
    throw new Error("Original course file download failed");
  }

  const contents = dataOf(await client.callTool({
    name: "campus_get_course_contents",
    arguments: { year: currentYear, courseId },
  }));
  const sections = Array.isArray(contents.sections)
    ? contents.sections as Array<Record<string, unknown>>
    : [];
  const moduleId = sections.flatMap((section) =>
    Array.isArray(section.modules) ? section.modules as Array<Record<string, unknown>> : [])
    .find(({ id }) => typeof id === "number")?.id;
  if (typeof moduleId !== "number") throw new Error("No course-module ID is available");
  const courseModule = dataOf(await client.callTool({
    name: "campus_get_course_module",
    arguments: { year: currentYear, moduleId },
  }));
  const completion = dataOf(await client.callTool({
    name: "campus_get_completion_status",
    arguments: { year: currentYear, courseId },
  }));
  const calendar = dataOf(await client.callTool({
    name: "campus_get_calendar_events",
    arguments: { year: currentYear, courseIds: [courseId] },
  }));
  const upcoming = dataOf(await client.callTool({
    name: "campus_get_upcoming_actions",
    arguments: { year: currentYear, limit: 5 },
  }));
  const courseActions = dataOf(await client.callTool({
    name: "campus_get_course_actions",
    arguments: { year: currentYear, courseId, from: 0, limit: 5 },
  }));
  const assignments = dataOf(await client.callTool({
    name: "campus_list_assignments",
    arguments: { year: currentYear, courseIds },
  }));
  const assignmentCourses = Array.isArray(assignments.courses)
    ? assignments.courses as Array<Record<string, unknown>>
    : [];
  const assignmentSelection = assignmentCourses.flatMap((course) => {
    if (typeof course.id !== "number" || !Array.isArray(course.assignments)) return [];
    return (course.assignments as Array<Record<string, unknown>>).flatMap((assignment) =>
      typeof assignment.id === "number"
        ? [{ courseId: course.id as number, assignmentId: assignment.id }]
        : []);
  })[0];
  if (!assignmentSelection) throw new Error("No assignment ID is available");
  const assignmentDetails = dataOf(await client.callTool({
    name: "campus_get_assignment_details",
    arguments: { year: currentYear, ...assignmentSelection },
  }));
  const assignmentStatus = dataOf(await client.callTool({
    name: "campus_get_assignment_status",
    arguments: { year: currentYear, assignmentId: assignmentSelection.assignmentId },
  }));
  let submissionFileChecked = false;
  for (const course of assignmentCourses) {
    if (!Array.isArray(course.assignments) || submissionFileChecked) continue;
    for (const assignment of course.assignments as Array<Record<string, unknown>>) {
      if (typeof assignment.id !== "number") continue;
      const status = dataOf(await client.callTool({ name: "campus_get_assignment_status", arguments: { year: currentYear, assignmentId: assignment.id } }));
      const lastattempt = status.lastattempt as { submission?: { id?: number; plugins?: Array<{ fileareas?: Array<{ files?: Array<{ filesize?: number }> }> }> } } | undefined;
      const submission = lastattempt?.submission;
      if (!submission?.id) continue;
      for (const [pluginIndex, plugin] of (submission.plugins ?? []).entries()) {
        for (const [areaIndex, area] of (plugin.fileareas ?? []).entries()) {
          for (const [fileIndex, file] of (area.files ?? []).entries()) {
            if (typeof file.filesize !== "number" || file.filesize > 5 * 1024 * 1024) continue;
            const result = await client.callTool({ name: "campus_download_submission_file", arguments: { year: currentYear, assignmentId: assignment.id, submissionId: submission.id, pluginIndex, areaIndex, fileIndex } });
            if (result.isError) continue;
            const downloaded = dataOf(result);
            if (typeof downloaded.content !== "string" || typeof downloaded.bytes !== "number" || Buffer.from(downloaded.content, "base64").length !== downloaded.bytes) throw new Error("Submission file download failed");
            submissionFileChecked = true;
            break;
          }
          if (submissionFileChecked) break;
        }
        if (submissionFileChecked) break;
      }
      if (submissionFileChecked) break;
    }
  }
  const grades = dataOf(await client.callTool({
    name: "campus_get_grades",
    arguments: { year: currentYear, courseId },
  }));
  const forums = dataOf(await client.callTool({
    name: "campus_list_forums",
    arguments: { year: currentYear, courseIds: [courseId] },
  }));
  const forumRows = Array.isArray(forums.forums)
    ? forums.forums as Array<Record<string, unknown>>
    : [];
  const forumId = forumRows.find(({ id }) => typeof id === "number")?.id;
  if (typeof forumId !== "number") throw new Error("No forum ID is available");
  const forumDiscussions = dataOf(await client.callTool({
    name: "campus_get_forum_discussions",
    arguments: { year: currentYear, forumId, perPage: 5 },
  }));
  const discussionRows = Array.isArray(forumDiscussions.discussions)
    ? forumDiscussions.discussions as Array<Record<string, unknown>>
    : [];
  const discussionId = discussionRows
    .find(({ discussion }) => typeof discussion === "number")?.discussion;
  if (typeof discussionId !== "number") throw new Error("No discussion ID is available");
  const discussionPosts = dataOf(await client.callTool({
    name: "campus_get_discussion_posts",
    arguments: { year: currentYear, discussionId, perPage: 5 },
  }));

  let quizListing: Record<string, unknown> | undefined;
  let quizId: number | undefined;
  for (const candidateCourseId of courseIds) {
    const candidate = dataOf(await client.callTool({
      name: "campus_list_quizzes",
      arguments: { year: currentYear, courseId: candidateCourseId },
    }));
    const candidateQuizId = Array.isArray(candidate.quizzes)
      ? (candidate.quizzes as Array<Record<string, unknown>>)
        .find(({ id }) => typeof id === "number")?.id
      : undefined;
    if (typeof candidateQuizId === "number") {
      quizListing = candidate;
      quizId = candidateQuizId;
      break;
    }
  }
  if (!quizListing || quizId === undefined) throw new Error("No quiz ID is available");
  const quizAttempts = dataOf(await client.callTool({
    name: "campus_get_quiz_attempts",
    arguments: { year: currentYear, quizId },
  }));
  const quizBestGrade = dataOf(await client.callTool({
    name: "campus_get_quiz_best_grade",
    arguments: { year: currentYear, quizId },
  }));

  let moodlePage: Record<string, unknown> | undefined;
  for (const candidateCourseId of courseIds) {
    const candidateContents = candidateCourseId === courseId
      ? contents
      : dataOf(await client.callTool({
        name: "campus_get_course_contents",
        arguments: { year: currentYear, courseId: candidateCourseId },
      }));
    const candidateSections = Array.isArray(candidateContents.sections)
      ? candidateContents.sections as Array<Record<string, unknown>>
      : [];
    const pageId = candidateSections.flatMap((section) =>
      Array.isArray(section.modules) ? section.modules as Array<Record<string, unknown>> : [])
      .find(({ modname, instance }) => modname === "page" && typeof instance === "number")?.instance;
    if (typeof pageId === "number") {
      moodlePage = dataOf(await client.callTool({
        name: "campus_get_page",
        arguments: { year: currentYear, courseId: candidateCourseId, pageId },
      }));
      break;
    }
  }
  if (!moodlePage) throw new Error("No Moodle Page activity is available");

  const notifications = dataOf(await client.callTool({
    name: "campus_list_notifications",
    arguments: { year: currentYear, limit: 5 },
  }));
  const unreadNotifications = dataOf(await client.callTool({
    name: "campus_get_unread_notification_count",
    arguments: { year: currentYear },
  }));
  const gradeOverview = dataOf(await client.callTool({
    name: "campus_get_grade_overview",
    arguments: { year: currentYear },
  }));
  const groups = dataOf(await client.callTool({
    name: "campus_get_my_groups",
    arguments: { year: currentYear, courseId },
  }));
  const privateFiles = dataOf(await client.callTool({
    name: "campus_get_private_files_info",
    arguments: { year: currentYear },
  }));
  const upcomingRows = Array.isArray(upcoming.events)
    ? upcoming.events as Array<Record<string, unknown>>
    : [];
  const eventId = upcomingRows.find(({ id }) => typeof id === "number")?.id;
  if (typeof eventId !== "number") throw new Error("No upcoming event ID is available");
  const calendarEvent = dataOf(await client.callTool({
    name: "campus_get_calendar_event",
    arguments: { year: currentYear, eventId },
  }));

  async function findActivity(type: string) {
    for (const activityYear of [...years].reverse()) {
      const listing = dataOf(await client.callTool({
        name: "campus_list_courses",
        arguments: { year: activityYear, includeNonSubjects: true },
      }));
      const rows = listing.years;
      const activityCourses = Array.isArray(rows)
        && rows[0]
        && typeof rows[0] === "object"
        && "courses" in rows[0]
        && Array.isArray(rows[0].courses)
        ? rows[0].courses as Array<Record<string, unknown>>
        : [];
      for (const course of activityCourses) {
        if (typeof course.id !== "number") continue;
        const courseContents = dataOf(await client.callTool({
          name: "campus_get_course_contents",
          arguments: { year: activityYear, courseId: course.id },
        }));
        const activitySections = Array.isArray(courseContents.sections)
          ? courseContents.sections as Array<Record<string, unknown>>
          : [];
        const module = activitySections.flatMap((section) =>
          Array.isArray(section.modules) ? section.modules as Array<Record<string, unknown>> : [])
          .find(({ modname, instance }) => modname === type && typeof instance === "number");
        if (module) return { year: activityYear, courseId: course.id, module };
      }
    }
    throw new Error(`No ${type} activity is available`);
  }

  const choiceActivity = await findActivity("choice");
  const choiceId = choiceActivity.module.instance;
  if (typeof choiceId !== "number") throw new Error("No Choice instance ID is available");
  const choices = dataOf(await client.callTool({
    name: "campus_list_choices",
    arguments: { year: choiceActivity.year, courseId: choiceActivity.courseId },
  }));
  const choiceOptions = dataOf(await client.callTool({
    name: "campus_get_choice_options",
    arguments: { year: choiceActivity.year, choiceId },
  }));

  const groupChoiceActivity = await findActivity("choicegroup");
  const groupChoiceId = groupChoiceActivity.module.instance;
  if (typeof groupChoiceId !== "number") throw new Error("No Group Choice instance ID is available");
  const groupChoiceOptions = dataOf(await client.callTool({
    name: "campus_get_group_choice_options",
    arguments: { year: groupChoiceActivity.year, groupChoiceId },
  }));

  const bookActivity = await findActivity("book");
  const books = dataOf(await client.callTool({
    name: "campus_list_books",
    arguments: { year: bookActivity.year, courseId: bookActivity.courseId },
  }));

  const h5pActivity = await findActivity("h5pactivity");
  const h5pActivityId = h5pActivity.module.instance;
  if (typeof h5pActivityId !== "number") throw new Error("No H5P instance ID is available");
  const h5pActivities = dataOf(await client.callTool({
    name: "campus_list_h5p_activities",
    arguments: { year: h5pActivity.year, courseId: h5pActivity.courseId },
  }));
  const h5pAttempts = dataOf(await client.callTool({
    name: "campus_get_h5p_attempts",
    arguments: { year: h5pActivity.year, h5pActivityId },
  }));
  const h5pResults = dataOf(await client.callTool({
    name: "campus_get_h5p_results",
    arguments: { year: h5pActivity.year, h5pActivityId },
  }));

  const scormActivity = await findActivity("scorm");
  const scormId = scormActivity.module.instance;
  if (typeof scormId !== "number") throw new Error("No SCORM instance ID is available");
  const scormActivities = dataOf(await client.callTool({
    name: "campus_list_scorm_activities",
    arguments: { year: scormActivity.year, courseId: scormActivity.courseId },
  }));
  const scormAttemptCount = dataOf(await client.callTool({
    name: "campus_get_scorm_attempt_count",
    arguments: { year: scormActivity.year, scormId },
  }));
  const scormStructure = dataOf(await client.callTool({
    name: "campus_get_scorm_structure",
    arguments: { year: scormActivity.year, scormId },
  }));
  const scoRows = Array.isArray(scormStructure.scoes)
    ? scormStructure.scoes as Array<Record<string, unknown>>
    : [];
  const scoId = scoRows.find(({ id }) => typeof id === "number")?.id;
  if (typeof scoId !== "number") throw new Error("No SCO ID is available");
  const scormTracks = dataOf(await client.callTool({
    name: "campus_get_scorm_tracks",
    arguments: { year: scormActivity.year, scoId },
  }));

  console.log(JSON.stringify({
    ok: true,
    authentication: {
      status: authentication.status,
      configuredYears: authentication.configuredYears,
    },
    years: summaries,
    liveTools: {
      year: currentYear,
      courseId,
      courseMatches: Array.isArray(courseMatches.matches) ? courseMatches.matches.length : 0,
      resources: Array.isArray(resources.resources) ? resources.resources.length : 0,
      resourceText: {
        readable: resourceText.readable,
        downloadedBytes: resourceText.downloadedBytes,
        pagesRead: resourceText.pagesRead,
        characters: resourceText.text.length,
      },
      sections: Array.isArray(contents.sections) ? contents.sections.length : 0,
      courseModule: typeof courseModule.cm === "object",
      completionStatuses: Array.isArray(completion.statuses) ? completion.statuses.length : 0,
      calendarEvents: Array.isArray(calendar.events) ? calendar.events.length : 0,
      upcomingActions: Array.isArray(upcoming.events) ? upcoming.events.length : 0,
      courseActions: Array.isArray(courseActions.events) ? courseActions.events.length : 0,
      assignmentCourses: Array.isArray(assignments.courses) ? assignments.courses.length : 0,
      assignmentDetails: typeof assignmentDetails.assignment === "object",
      assignmentStatus: typeof assignmentStatus.lastattempt === "object",
      originalResource: true,
      submissionFile: submissionFileChecked,
      gradeUsers: Array.isArray(grades.usergrades) ? grades.usergrades.length : 0,
      forums: Array.isArray(forums.forums) ? forums.forums.length : 0,
      forumDiscussions: Array.isArray(forumDiscussions.discussions) ? forumDiscussions.discussions.length : 0,
      discussionPosts: Array.isArray(discussionPosts.posts) ? discussionPosts.posts.length : 0,
      quizzes: Array.isArray(quizListing.quizzes) ? quizListing.quizzes.length : 0,
      quizAttempts: Array.isArray(quizAttempts.attempts) ? quizAttempts.attempts.length : 0,
      quizBestGrade: typeof quizBestGrade.hasgrade === "boolean",
      moodlePage: typeof moodlePage.page === "object",
      notifications: Array.isArray(notifications.notifications) ? notifications.notifications.length : 0,
      unreadNotifications: typeof unreadNotifications.count === "number",
      gradeOverview: Array.isArray(gradeOverview.grades) ? gradeOverview.grades.length : 0,
      groups: Array.isArray(groups.groups) ? groups.groups.length : 0,
      privateFiles: typeof privateFiles.filecount === "number",
      calendarEvent: typeof calendarEvent.event === "object",
      choices: Array.isArray(choices.choices) ? choices.choices.length : 0,
      choiceOptions: Array.isArray(choiceOptions.options) ? choiceOptions.options.length : 0,
      groupChoiceOptions: Array.isArray(groupChoiceOptions.options) ? groupChoiceOptions.options.length : 0,
      books: Array.isArray(books.books) ? books.books.length : 0,
      h5pActivities: Array.isArray(h5pActivities.h5pactivities) ? h5pActivities.h5pactivities.length : 0,
      h5pAttempts: Array.isArray(h5pAttempts.usersattempts) ? h5pAttempts.usersattempts.length : 0,
      h5pResults: typeof h5pResults === "object",
      scormActivities: Array.isArray(scormActivities.scorms) ? scormActivities.scorms.length : 0,
      scormAttemptCount: typeof scormAttemptCount.attemptscount === "number",
      scormStructure: scoRows.length,
      scormTracks: typeof scormTracks.data === "object",
    },
  }, null, 2));
} finally {
  await client.close();
}
