# Security

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not put
real UAB tokens, credentials, grades, message contents, or complete Campus API
responses in a public issue.

## Sensitive local data

Never commit or share:

- `data/tokens.json`;
- `data/browser-profile/`;
- UAB usernames, passwords, cookies, or Microsoft session data;
- downloaded course material or Moodle API responses;
- `.env` files or MCP client configuration containing secrets.

Anyone who obtains a Moodle token can act with the permissions granted to that
token. Store token files with owner-only permissions and revoke or refresh them
if they may have been exposed.

`npm run doctor -- --live --json` is designed to omit tokens, identities, and
private paths. Review diagnostic output before posting it publicly, especially
after adding local modifications.

## HTTP deployments

The HTTP transport requires `MCP_HTTP_TOKEN`, but a static shared secret is not
a substitute for user-specific authorization. It is suitable for one owner on
a private network when combined with HTTPS and a VPN or trusted access proxy.

Do not expose plain HTTP to the internet. A shared or public deployment should
use an OAuth 2.1 authorization server, per-user access controls, request limits,
and audit logging in front of this application.

Restrict `MCP_ALLOWED_HOSTS` to the actual reverse-proxy and local hostnames.
Keep the Compose port bound to `127.0.0.1` unless a firewall and trusted network
boundary require otherwise.

## Output redaction

Before tool output reaches a client, object fields with token-, password-,
secret-, cookie-, authorization-, or sesskey-like names are replaced with
`[redacted]`. In every string, the values of credential query parameters
(`token`, `wstoken`, `privatetoken`, `sesskey`, `authtoken`, `userkey`, `key`,
`sig`, `signature`, `access_token`, `refresh_token`, `password`, `secret`) are
redacted wherever they appear: whole URLs, URLs inside HTML attributes or plain
text, `&amp;`-escaped URLs, and percent-encoded URLs nested in another
parameter.

This is a defence in depth, not a guarantee. A secret Moodle places outside a
recognised query parameter is not detected, so tools should still avoid
returning fields that only carry action links (such as edit or delete URLs).

## Moodle boundary

The Moodle read-function allowlist is a security control. The experimental
assignment submission workflow uses separately named write operations, disabled
by default and unavailable over HTTP. Its [guide](docs/write-tools.md) describes
the required opt-in, client confirmations and limitations. Quiz, messaging,
forum-posting, enrolment, grading, attendance and calendar-writing functions
remain out of scope.

Course names, descriptions, announcements, forum posts, links, and attached
file metadata are untrusted content supplied by Moodle users. MCP clients must
treat them as data, not as system instructions or authorization to call tools,
open links, download files, or disclose information.
