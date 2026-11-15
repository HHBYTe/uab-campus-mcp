# Campus coverage map

This map records which UAB Campus surfaces have a purpose-built MCP tool and
which remain browser fallbacks. It is based on the Moodle capabilities exposed
by UAB plus representative pages and modules found across multiple academic
years. A capability advertised by Moodle is not, by itself, enough to expose a
tool.

## Verified named reads

| Surface | Coverage |
|---|---|
| Account | Authentication status, configured years, basic profile |
| Dashboard | Notifications, unread count, upcoming actions |
| Courses | Enrolments, search, sections, modules, flat resources, bounded original file reads, PDF/HTML/text extraction, own groups |
| Calendar | Course/time-range events, global and course-specific upcoming actions, exact event details |
| Grades | Course grade items and cross-course grade overview |
| Completion | Authenticated user's activity-completion states |
| Assignments | Listing, shared details, authenticated user's submission status and bounded personal current-submission file reads |
| Forums | Forums, discussions, root posts and replies |
| Quizzes | Settings, authenticated user's attempts and best grade |
| Page | Page metadata and instructional body |
| Choice | Activities, options and authenticated user's current selection |
| Group Choice | Options, capacity counts and authenticated user's current selection |
| Book | Book metadata and navigation settings |
| H5P | Activities, authenticated user's attempts and report results |
| SCORM | Activities, package structure, attempt count and personal tracks |
| Private files | File/folder counts and storage usage only |

The [tool guide](tools.md) documents the exact discovery-to-detail flow and ID
relationships for these tools.

## Covered by generic resource discovery

Folder contents, uploaded resources, ordinary URLs, labels, and module links
are already represented by `campus_get_course_contents` and
`campus_list_resources`. Separate tools would duplicate the same data without
adding a stable operation.

## Browser fallback

These surfaces were found in UAB courses but do not currently have a stable,
read-only token contract that adds useful information beyond generic module
metadata:

- Attendance
- Group self-selection (`groupselect`)
- Kaltura video resources (`kalvidres`)
- LTI activities
- Wooclap activities
- Book chapter bodies

Browser fallback is a capability of the MCP client, not of this server. It does
not authorize form submission or any other change.

## Advertised but not grounded yet

UAB's Moodle token advertises read functions for Database, Feedback, Glossary,
Lesson, Wiki, Workshop, badges, and other standard Moodle features. No
representative enrolled module was available during the current inspection, so
these have not been promoted to public named tools. They should be added only
after a real page, permissions, parameters, and response shape can be verified.

## Deliberately excluded

- Generic arbitrary Moodle function calls
- `view_*` and logging functions that can register a view or affect completion
- Starting, continuing, answering, or submitting quiz, H5P, or SCORM attempts
- Forum posts, messages, enrolment, or group changes
- Calendar, preference, favourite, completion, file, or profile mutations
- Broad participant or class-result enumeration when an own-user read exists

An experimental, opt-in personal assignment submission workflow is documented
separately in [write-tools.md](write-tools.md). Normal discovery remains
read-only and personal progress tools target the authenticated user.
