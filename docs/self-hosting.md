# Self-hosting UAB Campus MCP

Use Streamable HTTP when the MCP client and this server run on different
machines. The endpoint requires a bearer secret and validates the HTTP host.

This guide is intended for a private, single-user deployment. Read the
[security policy](../SECURITY.md) before exposing the HTTP transport.

## Authenticate first

The login needs a graphical browser. Complete the local authentication flow
from the main [README](../README.md), then transfer only `data/tokens.json` to
the server through an encrypted channel. For example:

```bash
scp data/tokens.json user@server:/opt/uab-campus-mcp/data/tokens.json
ssh user@server 'chmod 600 /opt/uab-campus-mcp/data/tokens.json'
```

Do not upload `data/browser-profile`.

## Docker Compose

Clone the repository on the server and put `tokens.json` in its `data/`
directory. Create `.env` from [`.env.example`](../.env.example) and set at
least:

```dotenv
MCP_HTTP_TOKEN=replace-with-a-random-secret-of-at-least-32-characters
MCP_ALLOWED_HOSTS=mcp.example.com,localhost,127.0.0.1
```

Generate a suitable secret with `openssl rand -hex 32`, then start the server:

```bash
docker compose up -d --build
curl http://127.0.0.1:3000/health
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`. The Compose service binds only
to localhost by default, runs without Linux capabilities, mounts the token file
read-only, and uses a read-only container filesystem.

## Network exposure

Place an HTTPS reverse proxy, a VPN such as Tailscale, or an authenticated
access proxy in front of the service before connecting from another machine.
Add the external hostname to `MCP_ALLOWED_HOSTS`. The proxy must support
streaming responses and should not buffer Server-Sent Events.

The shared bearer secret is intended for a private personal deployment. A
multi-user or directly public service should use a real OAuth 2.1 authorization
server with per-user access controls instead of sharing one token.

## Connect a remote client

A remote MCP client needs the endpoint and bearer header. Configuration names
vary by client; the common shape is:

```json
{
  "url": "https://mcp.example.com/mcp",
  "headers": {
    "Authorization": "Bearer your-MCP_HTTP_TOKEN"
  }
}
```

## Run without Docker

```bash
npm ci
npm run build
export UAB_TOKEN_FILE=/opt/uab-campus-mcp/data/tokens.json
export MCP_HTTP_TOKEN="$(openssl rand -hex 32)"
export MCP_ALLOWED_HOSTS="mcp.example.com,localhost,127.0.0.1"
export MCP_HOST=127.0.0.1
export MCP_PORT=3000
npm run start:http
```

Run the process under systemd or another process supervisor for automatic
restarts. Use `MCP_HOST=0.0.0.0` only inside a container or when a firewall and
trusted network boundary are already in place.

## Verify the deployment

Check the local health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

Run the share-safe diagnostic report from the deployment directory:

```bash
npm run doctor -- --live --json
```

The MCP process rereads `tokens.json` for every tool call. After renewing UAB
authentication on a trusted desktop, replace the server's token file; a process
restart is not required.
