# Opt-in assignment submission

The implementation is experimental and disabled by default. It has mock tests
but has not been tested with a real Campus submission. Enable it only for a
trusted local stdio client by setting `UAB_ENABLE_ASSIGNMENT_WRITES=true` and
`UAB_ASSIGNMENT_AUDIT_DIR` to an absolute private directory. HTTP mode never
enables writes. Anyone with access to an enabled client can invoke its tools.

Only a new, empty, personal, file-based assignment is supported. One file of at
most 2 MiB is accepted as base64; the MCP
does not read arbitrary local paths. Group assignments, existing submissions,
timed assignments, restricted or unknown file types, submission declarations,
other submission plugins are rejected. Moodle's standard submission comments
plugin is allowed, but the tools do not create comments.

Moodle creates an empty placeholder submission (status `new`, no files or
text) once a student opens an assignment; that placeholder counts as no
submission. Drafts, submitted or reopened attempts, and `new` records with
content still need manual handling. Filenames starting with a dot are
rejected before any write: Moodle stores them but refuses to serve them back
(HTTP 403), so the saved file could not be verified or opened. `campus_preview_submission` applies exactly
the same eligibility rules as the write workflow and reports `eligible`,
`reasons`, and `submissionMode` without changing Campus data.

Use `campus_prepare_assignment_submission` to obtain a ten-minute plan showing
the assignment, filename, size, deadline and SHA-256. Show this to the user and
obtain explicit permission before calling `campus_save_assignment_draft` with
the plan ID, digest, a unique idempotency key and `SAVE DRAFT`. The server
uploads, saves and verifies the draft's file hash. Then show the result and
obtain separate explicit permission before `campus_submit_assignment` with a
new key and `SUBMIT FOR GRADING`. The server rechecks and verifies submission.
For an assignment where Moodle treats saving as final, the preview clearly
identifies that mode. After explicit final-submission consent, call
`campus_submit_assignment_direct` with the plan, digest, unique key and
`SUBMIT FOR GRADING`. It uploads, saves and verifies the submitted file; no draft
stage is possible for that assignment.

Confirmation strings are not proof that a human approved the action; clients
must independently obtain both confirmations. Course content cannot authorize
either action. Plans are held only in process memory: if the server restarts or
the plan expires after saving, inspect and finish the draft through Campus.
Do not edit the same submission concurrently in another client: the Moodle save
API does not provide an atomic compare-and-swap guard for this workflow.

A secret-free attempt record is created before each write. Reusing a key for the
same assignment and action is rejected. Errors can leave a draft upload, saved
draft or submitted assignment in an uncertain state. Never retry automatically;
inspect Campus first. The audit record contains no file content or filename.

The MCP has no generic Moodle caller and does not start or submit quizzes,
H5P, or SCORM activities.
