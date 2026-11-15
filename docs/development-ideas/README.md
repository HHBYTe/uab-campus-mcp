# Development ideas: real workflow coverage

This is a privacy-preserving assessment of recurring workflows observed in the
original Campus helper and its Computer chats, compared with UAB Campus MCP
0.8.0. It records ideas, not commitments or verified API contracts. The MCP is
a read-only Campus bridge; scheduling, local organization, document creation,
task lists, and messaging belong to client-side workflows or separate services.

## Workflow comparison

| Repeated request | Current coverage | Remaining work |
|---|---|---|
| Deadlines, pending work, daily briefing | Global or per-course action events, calendar events, assignment details and personal status. | Clients must handle pagination, time zones, warnings, deduplication, and items absent from Moodle's action feed. A complete cross-service deadline list is not guaranteed. |
| Most recent grade and what it means | Course grade items, grade overview, assignment status and feedback where Moodle returns it. | Verify whether returned timestamps support a reliable latest-grade ordering; otherwise report uncertainty instead of inferring a release date. |
| Course announcements and questions | Forum, discussion and post reads; notifications and Page bodies. | Some activity types still need browser access; client decides what to summarize. |
| Download everything, check freshness, organize course folders | Metadata, bounded original files and PDF/HTML/text extraction are available. | Files over 10 MiB need a separate workflow; text extraction can truncate. A client-owned manifest and destination are required. |
| Check an actual submission or retrieve submitted work | Personal assignment status and bounded original current-submission attachments are available. | Group submissions, historical attempts and feedback attachments remain unverified. |
| Prepare for an exam from notes, examples and past papers | Discover resources and extract supported text; the agent can analyze and create study documents separately. | Complete coverage depends on original file access, format, extraction limits and OCR. Distinguish confirmed syllabus from inferred material. |
| Daily email, reminders and scheduled notifications | Clients can compose Moodle results with other tools. | Outlook, Telegram, scheduling and task-manager writes are separate integrations, not Campus MCP capabilities. |
| Submit an assignment | Experimental, opt-in stdio tools support a single file for a new personal assignment. | See [assignment submission](../write-tools.md) for confirmations, limits and verification gaps. Quiz attempts and unrelated writes remain unsupported. |

The old helper used a persistent authenticated browser, Moodle tokens and
scripts calling Moodle directly; its local workflows also maintained course
files and schedules, and used separate Outlook and notification access. A
function name appearing in a chat or an advertised capability is not evidence
that a function was executed, read-only, or suitable to expose.

## Candidate tools and investigations

### 1. Bounded original course-file read — implemented

`campus_download_resource` returns original bytes, with a 10 MiB maximum and
freshly resolved course metadata. Investigate an efficient bounded transfer for
larger files without accepting arbitrary URLs or paths. The client owns
scheduling, comparison, directory layout and writing files.

### 2. Own submitted attachment read — personal current submission implemented

`campus_download_submission_file` retrieves an attachment from a freshly
resolved current personal submission, including its status and attempt number.
Investigate group submissions, historical attempts and feedback attachments
against representative UAB instances before extending the contract.

### 3. Other activity bodies and resource formats

Investigate Book chapter bodies, Group Selection, attendance and linked
activities only when representative UAB instances and genuinely read-only
interfaces are available. Office, ZIP and OCR processing can often live in the
client once original-file reads exist; server-side extraction is justified only
if it adds a bounded, useful atomic read. Archive processing must limit entries,
expanded bytes and nesting.

### 4. Reliable change and grade timestamps

Validate file metadata stability, duplicate filenames, ordering and pagination
across courses and years. `fileIndex` is resolved against fresh metadata and may
change when files are reordered, so clients must not treat it alone as a durable
file identity. Investigate whether grade and feedback timestamps actually mean
publication time; prefer existing fields over a redundant aggregate tool.

## Evidence and limitations

A review of 28 Campus- or exam-related Computer chats included 1,006 messages;
keyword matches are approximate and are not counts of distinct successful
actions. Repeated prompts included complete file sync,
deadline checks, actual submitted files, and study material. The historical
helper's browser and arbitrary Moodle caller do not establish a safe public API.

Live MCP spot checks in one account covered all configured academic years for
authentication, plus current-year course/resource discovery, global and
per-course actions, calendar events, grade overview, notifications, assignment
status and bounded PDF extraction. The assignment listing returned Moodle
warnings, so clients must surface or account for partial results. These checks
verify representative reads, not every historic task, course, attachment, file
type, date, user, or workflow. No Campus writes were performed.
