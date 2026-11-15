# Updating

How to move an existing installation to a newer version of UAB Campus MCP.
Updating never requires a new UAB login: `data/tokens.json` and
`data/browser-profile/` are ignored by Git and survive `git pull`.

## Before updating

Check what changed since your version in the [changelog](../CHANGELOG.md)
or the [GitHub releases](https://github.com/HHBYTe/uab-campus-mcp/releases).
Your current version is in `package.json`. Changes that can break scripts or
prompts are listed under **Breaking**.

Tool output can change between versions, for example when fields are renamed
or responses are made more compact. If you have scripts or prompts that read
specific fields, compare them with the [tool guide](tools.md) after updating.

## Local installation (stdio)

```bash
cd /absolute/path/uab-campus-mcp
git pull
npm ci --include=dev
npm run build
npm run doctor
```

`npm ci` reinstalls dependencies exactly as locked, and `npm run build`
regenerates `dist/`, which is what the MCP client runs. `npm run doctor` is an
optional health check; add `-- --live` to validate every academic year against
UAB.

Then **restart the MCP client**. Clients start the server process once and keep
it running, so new code and new tools only load after a restart.

## Self-hosted with Docker Compose

```bash
cd /path/to/uab-campus-mcp
git pull
docker compose up -d --build
curl http://127.0.0.1:3000/health
```

The rebuilt container reuses `data/tokens.json` and `.env`. Remote clients may
need to reconnect to see new tools.

## Self-hosted without Docker

```bash
cd /opt/uab-campus-mcp
git pull
npm ci --include=dev
npm run build
```

Restart the process through its supervisor (for example
`systemctl restart <your-service>`), then check `/health` as described in the
[self-hosting guide](self-hosting.md#verify-the-deployment).

## If new tools or parameters do not appear

Some MCP clients cache the tool list, so new tools or new parameters on
existing tools may not show up even after a restart. Re-registering the server
forces a refresh. For Claude Code, for example:

```bash
claude mcp remove uab-campus -s user
claude mcp add uab-campus --scope user \
  -e UAB_TOKEN_FILE=/absolute/path/uab-campus-mcp/data/tokens.json \
  -- node /absolute/path/uab-campus-mcp/dist/index.js
```

Use the scope and paths of your original registration. Other clients have
an equivalent reload or reconnect action.

## If something breaks

- `npm run doctor` reports configuration and authentication problems without
  printing tokens.
- An expired UAB token is unrelated to updating; renew it as described in the
  [README](../README.md#renewing-uab-authentication).
- To return to the previous version, check out the commit you were on and
  rebuild:

  ```bash
  git log --oneline -5
  git checkout <previous-commit>
  npm ci --include=dev
  npm run build
  ```

  Restart the client afterwards. Run `git checkout main` to come back to the
  latest version later.
