# UAB Campus MCP

[![CI](https://github.com/HHBYTe/uab-campus-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/HHBYTe/uab-campus-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Model Context Protocol server for the Universitat Autonoma de
Barcelona Campus Virtual (`cv.uab.cat`) and its yearly Moodle instances
(`e-aules.uab.cat`).

It lets an MCP client inspect the courses already available to a UAB account.
It is read-only by default. An experimental, explicitly enabled local stdio
mode supports a narrow assignment-submission workflow; see the
[submission guide](docs/write-tools.md). It cannot attempt quizzes, post
messages, change enrolment, or call arbitrary Moodle functions.

This is an unofficial community project and is not affiliated with or endorsed
by the Universitat Autonoma de Barcelona.

## Acceptable use and UAB regulations

This tool acts with your own UAB account, so UAB's rules for its information
systems apply to how you use it, in particular the
[*Normativa de seguretat d'utilització dels recursos i sistemes d'informació*](https://www.uab.cat/doc/Politica_utilitzacio_recursos)
(Consell de Govern, 10 February 2026). Nothing in it addresses tools like this
one specifically. This section is not legal advice; you are responsible for
your own use.

- **Use only your own account.** UAB accounts are personal and
  non-transferable (art. 7.7). Never share your `tokens.json`, use someone
  else's, or run a server that gives other people access through your account
  (art. 37.1.b).
- **Course content belongs to its authors.** Materials and forum posts are for
  your own study. Do not redistribute them (art. 10.3).
- **Think before sending Campus content to third parties.** Your MCP client may
  forward tool results to an AI provider. Forum posts and other content can
  contain other people's personal data; the regulation treats sending
  protected information to unauthorised external systems as misuse
  (art. 37.1.n.IV).
- **Keep the load light.** Avoid frequent scheduled jobs or bulk downloads
  that could burden shared systems (art. 37.1.f).
- **Assignment submission is your responsibility.** The optional write tools
  submit work in your name. They are disabled by default; enable them only if
  you accept that responsibility.
- **How it signs in.** The login uses the same Moodle mobile web service as the
  official Moodle app, with your own sign-in and MFA. UAB enabled that service
  for its app and may change or restrict it at any time.

## Tool-first design

Purpose-built tools are the primary interface. Agents should use them before
navigating Campus pages because they return smaller structured responses, avoid
repeated page discovery, and make multi-step workflows faster and more
predictable.

The current tool catalog, ID relationships, and composition examples are kept
in the [tool guide](docs/tools.md). MCP clients can also discover the active
catalog directly through the standard `tools/list` operation.

The server is intentionally only the Campus bridge. Scheduling, downloaded
content organization, to-do synchronization, summaries, and notifications are
client-owned workflows. See the [client workflow guide](docs/workflows.md) for
practical patterns and the boundary between the MCP and downstream automation.

If the tools do not cover a task, a client that separately has authenticated
browser access may fall back to the normal Campus interface. That fallback is
outside this MCP and does not expose arbitrary Moodle API calls. Repeated missing reads are candidates for new
elemental tools.

## Requirements

- A valid UAB account with Campus Virtual access
- Node.js 20 or newer
- Git
- Chromium or Chrome for the one-time interactive login

The authentication script opens the official UAB pages. You enter your account
and complete Microsoft MFA in the browser yourself. This project never asks
for, reads, or stores your password.

## Local setup

### 1. Install

```bash
git clone https://github.com/HHBYTe/uab-campus-mcp.git
cd uab-campus-mcp
npm ci --include=dev
```

The explicit `--include=dev` is required because the authentication and build
tools are development dependencies. It also works when npm is configured to
omit development packages by default.

### 2. Authenticate

Choose one browser option.

To use Playwright's bundled Chromium:

```bash
npx playwright install chromium
npm run auth
```

To use an existing Chrome installation on Linux or macOS:

```bash
UAB_BROWSER_CHANNEL=chrome npm run auth
```

On Windows PowerShell:

```powershell
$env:UAB_BROWSER_CHANNEL="chrome"
npm run auth
```

To use any other Chromium-based browser already installed, such as the
`chromium` package of many Linux distributions, pass its executable path:

```bash
UAB_BROWSER_EXECUTABLE=/usr/bin/chromium-browser npm run auth
```

Use the path on your system (`command -v chromium chromium-browser` finds it on
Linux). On Windows PowerShell, set `$env:UAB_BROWSER_EXECUTABLE` to the full
`.exe` path before `npm run auth`.

Sign in in the opened browser and complete MFA. The script discovers the
academic years available to your account, signs in to each Moodle instance,
and writes `data/tokens.json`. The token file and persistent browser profile
are ignored by Git and must remain private.

Verify the tokens:

```bash
npm run auth:check
```

For a broader local health report, use `npm run doctor`. Add `--live` to
validate every configured academic year against UAB:

```bash
npm run doctor
npm run doctor -- --live
npm run doctor -- --live --json
```

The JSON report omits tokens, identities, and private paths, so it is suitable
for attaching to a bug report after reviewing it. Local warnings do not fail
the command; configuration or live authentication errors do.

The portal normally discovers available years automatically. To refresh a
specific year that is not linked there, pass it explicitly:

```bash
npm run auth -- 2026-27
```

### 3. Build

```bash
npm run build
```

### 4. Add it to an MCP client

Use absolute paths. A typical stdio configuration is:

```json
{
  "mcpServers": {
    "uab-campus": {
      "command": "node",
      "args": ["/absolute/path/uab-campus-mcp/dist/index.js"],
      "env": {
        "UAB_TOKEN_FILE": "/absolute/path/uab-campus-mcp/data/tokens.json"
      }
    }
  }
}
```

Windows paths in JSON need escaped backslashes:

```json
{
  "command": "node",
  "args": ["C:\\Users\\you\\uab-campus-mcp\\dist\\index.js"],
  "env": {
    "UAB_TOKEN_FILE": "C:\\Users\\you\\uab-campus-mcp\\data\\tokens.json"
  }
}
```

For Claude Code, register the same command and environment variable from a
terminal instead of editing JSON:

```bash
claude mcp add uab-campus --scope user \
  -e UAB_TOKEN_FILE=/absolute/path/uab-campus-mcp/data/tokens.json \
  -- node /absolute/path/uab-campus-mcp/dist/index.js
```

`--scope user` makes the server available in every project; omit it to
register it only for the current directory. `claude mcp list` should then show
`uab-campus` as connected.

Restart the MCP client, then ask it to list `uab-campus` tools or call
`campus_list_years`.

## Updating

To move an existing installation to a newer version, pull, reinstall, rebuild,
and restart the MCP client:

```bash
git pull
npm ci --include=dev
npm run build
```

Your UAB tokens are kept. The [updating guide](docs/updating.md) covers
self-hosted deployments, checking what changed, clients that cache the tool
list, and rolling back.

## Self-hosted setup

Remote and server deployments are covered in the
[self-hosting guide](docs/self-hosting.md).

## Renewing UAB authentication

If `npm run auth:check` reports an expired token, run the interactive flow
again:

```bash
npm run auth
npm run auth:check
```

For a remote deployment, replace its `tokens.json` with the refreshed file.
The MCP process rereads the file on every tool call, so it does not need to be
restarted.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `UAB_TOKEN_FILE` | `data/tokens.json` | Absolute token-file path |
| `UAB_REQUEST_TIMEOUT_MS` | `30000` | Moodle request timeout, 1-120 seconds |
| `UAB_BROWSER_EXECUTABLE` | Playwright Chromium | Explicit browser executable |
| `UAB_BROWSER_CHANNEL` | unset | Browser channel such as `chrome` |
| `MCP_HOST` | `127.0.0.1` | HTTP listen address |
| `MCP_PORT` | `3000` | HTTP listen port |
| `MCP_HTTP_TOKEN` | required for HTTP | Bearer secret, at least 32 characters |
| `MCP_ALLOWED_HOSTS` | local hostnames | Comma-separated accepted HTTP hosts |

## Security model

- MCP tools are read-only by default. Optional assignment-write tools are
  enabled only through explicit local stdio configuration and annotated as
  state-changing.
- A second allowlist in the Moodle client rejects arbitrary function names.
- Token files, browser state, environment files, downloads, and logs are
  excluded from Git.
- Only HTTPS URLs under the exact host `e-aules.uab.cat` are accepted.
- Tool output recursively redacts token-like fields and credential URL
  parameters (`token`, `wstoken`, `privatetoken`, `sesskey`, `authtoken`, …),
  including URLs embedded in HTML or plain text. Redaction is best-effort.
- Authentication and MFA are explicit operator actions outside MCP.

See [SECURITY.md](SECURITY.md) before exposing the HTTP transport.

## Development

```bash
npm run check
npm run build
npm test
```

The tests cover token validation, diagnostics, the Moodle allowlist, parameter
encoding, secret redaction, HTTP bearer authentication, and a complete MCP
stdio handshake. Maintainers with valid UAB tokens can run the count-only
smoke test:

```bash
UAB_TOKEN_FILE=/private/path/tokens.json npm run smoke:live
```

## Contributing

Contributions are welcome and genuinely valued. Pull requests are reviewed and
accepted, whether they fix a bug, add a tool, improve the docs, or
report what does or does not work in your own degree's Campus.

Before opening a pull request:

- For anything larger than a small fix, open an issue first to agree on the
  approach.
- Keep the project read-only by default. New tools must not post, attempt,
  enrol, or otherwise change anything on Campus, and the server must never
  expose a generic Moodle function caller. A new Moodle function may only join
  the read-only allowlist once it is verified not to change server state.
- The optional assignment-submission tools are the only write path. They must
  stay disabled by default and keep their safeguards (preview, explicit
  confirmation, verification, audit record). [AGENTS.md](AGENTS.md) lists
  these rules in full.
- Prefer small, elemental tools that do one bounded read, and document them in
  the [tool guide](docs/tools.md).
- Run `npm run check`, `npm run build`, and `npm test`, and add tests for new
  behavior.
- Never include tokens, session keys, grades, names, message contents, or raw
  Campus responses in code, tests, issues, or pull requests. Use made-up
  values in test fixtures.

Report security problems privately as described in [SECURITY.md](SECURITY.md),
not in a public issue.

## License

[MIT](LICENSE)
