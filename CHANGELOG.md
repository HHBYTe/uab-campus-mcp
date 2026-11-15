# Changelog

All notable changes to UAB Campus MCP are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning

The project uses [semantic versioning](https://semver.org/). Before 1.0:

- A **minor** bump (`0.x.0`) adds tools or changes tool inputs or output
  shapes.
- A **patch** bump (`0.0.x`) contains fixes, documentation, and dependency
  updates that do not change tool inputs or outputs.
- Changes that can break clients, scripts, or prompts reading specific fields
  are always listed under a **Breaking** subsection.

Each release is tagged `vX.Y.Z` and published as a GitHub release with the
notes from this file. The version in `package.json`, `package-lock.json`, and
the MCP server must match; CI checks this.

## [Unreleased]

### Added

- This changelog, the versioning policy, and a CI check that keeps the version
  numbers consistent.

## [0.0.0] - 2026-11-15

Initial public release.

### Added

- Read-only MCP server for UAB Campus Virtual and its yearly Moodle instances
  (`e-aules.uab.cat`), over local stdio or self-hosted Streamable HTTP with
  bearer authentication and host validation.
- Interactive UAB login with MFA (`npm run auth`) that never reads the
  password, token checks (`npm run auth:check`), and a secret-free health
  report (`npm run doctor`).
- Read-only tools for courses (with subject / non-subject classification),
  course contents and resources, pages, completion, groups, grades,
  notifications, assignments, forums, quizzes, calendar and upcoming actions,
  Choice and Group Choice, books, H5P, and SCORM.
- Bounded text extraction from course files and assignment attachments (PDF,
  HTML, plain text, source code), and bounded original-file downloads of course
  files and the user's own submission files.
- Compact, documented tool output with consistent IDs (`cmid`, `instanceId`,
  `assignmentId`) and redaction of tokens and session keys, including URLs
  embedded in text.
- Optional assignment-submission workflow, disabled by default and available
  only on stdio when explicitly enabled, with preview, typed confirmation,
  SHA-256 matching, an audit record before each write, no automatic retry, and
  post-write verification.

[Unreleased]: https://github.com/HHBYTe/uab-campus-mcp/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/HHBYTe/uab-campus-mcp/releases/tag/v0.0.0
