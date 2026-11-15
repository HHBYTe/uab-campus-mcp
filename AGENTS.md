# Agent Guide

## Purpose

This repository is a public MCP adapter for UAB Campus Virtual. It is
read-only by default: the only exception is the optional assignment-submission
workflow, which is disabled unless the operator explicitly enables it. It must
work for any UAB user without containing deployment-specific paths or account
data. Preserve that boundary.

## Hard rules

- Never add credentials, token files, browser profiles, downloads, or live API
  responses to Git.
- Never expose a generic Moodle function-call tool.
- Prefer elemental tools that perform one bounded read. Compose workflows in
  clients or agents unless a server-side operation has a clear atomic reason.
- Keep named tools as the primary agent path. Browser access may be an external
  fallback, but must not become a generic Moodle function caller inside MCP.
- Never add a Moodle function to `READ_ONLY_FUNCTIONS` without verifying that
  it cannot change server state.
- Do not add quiz-attempt, enrolment, messaging, forum-posting, grading,
  attendance, or calendar-writing tools.
- Assignment submission is the only permitted write path, and it stays
  optional and disabled by default. Its tools may be registered only when
  `UAB_ENABLE_ASSIGNMENT_WRITES=true` and an absolute
  `UAB_ASSIGNMENT_AUDIT_DIR` are set, only on the local stdio transport, and
  never on HTTP. Keep its write functions out of `READ_ONLY_FUNCTIONS`; they
  are called only through the dedicated methods in `src/moodle-client.ts`.
- Changes to the submission workflow must keep its safeguards: fail-closed
  eligibility checks, preview before any write, explicit typed confirmation
  with a matching SHA-256, separate draft and final-submission steps where
  Moodle has them, an idempotency/audit record before each write, no automatic
  retry, and post-write verification. See [docs/write-tools.md](docs/write-tools.md).
- Authentication refresh and MFA remain operator actions outside MCP.
- Keep stdout reserved for MCP protocol traffic. Log only to stderr.
- HTTP changes must preserve bearer authentication and host validation.

## Architecture

- `src/token-store.ts` validates and reads the external token file per call.
- `src/moodle-client.ts` encodes Moodle parameters and enforces the allowlist.
- `src/submission-eligibility.ts` holds the fail-closed eligibility checks for
  assignment submission.
- `src/assignment-submission.ts` implements the optional, opt-in submission
  workflow (preview, draft, final submission, audit, verification).
- `src/course-tools.ts` implements pure course matching and resource shaping.
- `src/diagnostics.ts` performs safe live authentication checks for MCP clients.
- `src/sanitize.ts` removes token-like output before it reaches a client.
- `src/server.ts` defines the complete MCP surface.
- `src/index.ts` serves a fresh MCP instance over stdio.
- `src/http.ts` serves authenticated Streamable HTTP for private deployments.
- `scripts/auth.mjs` performs interactive UAB login without reading passwords.
- `scripts/doctor.mjs` emits local and optional live diagnostics without secrets.
- `scripts/live-smoke.ts` is opt-in and prints counts rather than private data.

## Verification

Run before publishing changes:

```bash
npm run check
npm run build
npm test
```

Use `npm run smoke:live` only when the account owner has provided a valid token
path and a live check is appropriate. Never print the token or raw responses.
