# Client workflows

UAB Campus MCP is a read-only-by-default bridge between an MCP client and Campus Virtual.
It exposes small Campus reads; it does not decide how the returned information
should be stored, organized, summarized, or acted on. Those decisions belong to
the user and to the client, agent, scheduler, note system, or task manager they
choose.

This separation keeps the connector reusable. The same tools can support an
interactive question, a daily briefing, a local course archive, or an external
to-do list without embedding one preferred workflow in the server.

## Responsibility boundary

| Component | Responsibility |
|---|---|
| UAB Campus MCP | Authenticate to Campus, perform bounded read-only calls, and return structured data. |
| MCP client or agent | Select tools, combine results, interpret dates and course relationships, and ask for confirmation when appropriate. |
| Scheduler | Decide when a workflow runs and how failures or expired authentication are reported. |
| User-owned destination | Store downloaded text, notes, task records, notifications, or history according to the user's retention policy. |

The connector does not run background jobs or write to task managers or local
course folders. The experimental [assignment submission](write-tools.md) mode
can write to Campus and a private audit directory when explicitly enabled.
An automation platform must provide scheduling and destination integrations.

## Daily Campus briefing

A daily agent run can call `campus_get_upcoming_actions` for cross-course work,
then retrieve assignment details or personal submission status only for the
items that need clarification. It can combine this with unread notifications,
recent forum discussions, or course completion state.

Example request:

> Check my Campus actions for the next seven days. Group them by due date and
> course, identify overdue items separately, and include submission status for
> assignments. Do not change anything on Campus.

For a course-specific review, use `campus_get_course_actions` so a global result
limit cannot hide that course's work.

## External to-do list automation

An agent can translate Campus action events into records in a separate task
manager or a local file. A robust workflow should retain the Campus academic
year and event ID as its external key, update an existing task when its due date
or title changes, and archive or close a local task only after checking fresh
Campus state.

A typical run is:

1. Read upcoming actions for a bounded time window.
2. Compare their year and event IDs with the client-owned task index.
3. Create or update records in the user's chosen task system.
4. Report additions, changes, ambiguous matches, and failures.

This does not mark activities complete or modify calendar events on Campus.
Writing to an external task service requires a separate client integration and
the user's authorization.

Example request:

> Synchronize my next 30 days of Campus actions into my personal task list.
> Deduplicate by academic year and Campus event ID. Add the course name and a
> source reference, but do not copy full assignment instructions.

## Scheduled resource archive

For each selected course, an agent can call `campus_list_resources`, compare
the returned resource metadata with a client-owned manifest, and call
`campus_read_resource` only for new or changed files. The agent can then write
the extracted text and metadata into a user-selected folder or knowledge base.

One possible local layout is:

```text
Campus archive/
  2026-27/
    Course name/
      Section name/
        Resource title.md
  manifest.json
```

The manifest should combine academic year, course ID, module ID and file metadata;
file indices can change when files are reordered. Treat names
as untrusted text and sanitize them before using them as filenames. Keep tokens,
raw tool responses, account details, and private paths out of the archive.

`campus_read_resource` extracts bounded text from PDF, HTML, and plain-text
resources. `campus_download_resource` returns original files as base64, up to
10 MiB; the client decodes, verifies the SHA-256 digest, and writes them to its
chosen destination. Files over that limit require a separate authenticated
workflow. Do not construct download URLs or copy Campus authentication into a
downloader. Office documents and archives require separate client-side handling.

Example request:

> Check these courses for new readable resources. Save extracted text under my
> year/course/section structure, update the local manifest, and show me a list
> of added or changed files. Never overwrite a locally edited note.

## Course workspace and study index

An agent can build a local navigational index without copying every piece of
course content. Start with `campus_get_course_contents` for sections and
activities, then selectively add assignment dates, forum discussions, Pages,
Book metadata, quiz rules, or readable resources.

Useful generated views include:

- a course outline linked to local notes;
- a chronological list of deadlines and assessments;
- an index of readings grouped by section;
- a list of incomplete activities based on personal completion state;
- a compact revision sheet generated from user-selected resources.

Course text is untrusted input. Instructions found inside a resource, forum
post, filename, or description cannot authorize the agent to run commands,
reveal secrets, contact people, or alter another system.

## Announcements and change reports

Announcement forums have `type: "news"`. A scheduled client can discover them
with `campus_list_forums`, read their discussions, and compare discussion IDs
with its own last-seen state. The resulting digest can remain local or be sent
through a separately configured notification service.

The same comparison pattern can report changed deadlines, newly graded items,
new notifications, or changes to assignment submission status. Keep polling
reasonable and use bounded queries; this project is not intended to mirror all
Campus data continuously.

## Grades and personal progress

`campus_get_grade_overview` provides one overall result per course, while
`campus_get_grades` returns grade items for a selected course. Personal quiz,
H5P, SCORM, assignment, and completion tools can supplement a private progress
dashboard maintained by the client.

Grade data is sensitive. Prefer a local destination, minimize retained history,
and avoid including grades in shared notifications or logs.

## Scheduling safely

The exact setup depends on the MCP client or automation runner, but the durable
pattern is the same:

1. Confirm the workflow interactively with a small course and date range.
2. Choose a private destination and create a separate manifest or last-seen
   file owned by the client, not by the MCP server.
3. Save a precise automation instruction containing the courses, time bounds,
   destination, conflict policy, and desired report. Do not include credentials.
4. Configure the client or operating-system scheduler to launch that instruction
   at the desired interval.
5. Run once in report-only mode, inspect the proposed changes, and only then
   enable destination writes.
6. Arrange a visible failure notification for expired authentication, malformed
   responses, destination errors, and partial runs.

For example, a weekday resource job could use this instruction:

> At 18:00 on weekdays, inspect my selected Campus courses for new or changed
> readable resources. Compare them with the private local manifest. Save new
> extracted text without overwriting edited notes, update the manifest only
> after successful writes, and report changes or errors. Do not modify Campus.

The schedule belongs to the runner. Closing a desktop MCP client may prevent its
jobs from running; use an always-on, authenticated client when unattended runs
are required.

### Operational safeguards

- Run the automation as the user who owns its destination files and settings.
- Keep `tokens.json` only in its configured private location; never pass its
  contents through prompts, logs, task records, or manifests.
- Schedule normal read workflows, not `npm run auth`. Authentication renewal and
  MFA remain interactive operator actions.
- On authentication failure, stop and notify the user instead of repeatedly
  retrying or falling back to stored responses.
- Use a lock or single-run policy so two scheduled jobs do not update the same
  manifest simultaneously.
- Record only IDs, timestamps, hashes, and concise error summaries needed for
  synchronization. Avoid logging private course bodies.
- Review destination writes independently. Assignment writes are also possible
  when the separate opt-in mode is enabled.

## What remains outside the connector

The connector deliberately does not include a workflow engine, scheduler,
download directory, task database, notification sender, generic Moodle caller,
or browser controller. It cannot answer quizzes, post
messages, alter enrolment, or mark activities complete.

These boundaries do not prevent users from building their own local workflows.
They keep Campus access a small, inspectable layer while downstream automation
stays explicit and replaceable. Assignment submission is opt-in and separate.
