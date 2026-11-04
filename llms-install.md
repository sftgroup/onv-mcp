# ONV MCP server — agent installation guide

This file is written for AI coding agents (Cline, Cursor, Claude Desktop) that are asked to
install the ONV MCP server. Follow the steps in order; do not invent extra configuration.

## What this server is

`@onvcodes/mcp-server` is a thin stdio MCP proxy for the ONV platform (https://onv.codes).
It discovers its tools at runtime from the platform — the npm package does not hard-code
tool definitions. It exposes market data, the public factor catalog, strategy passports,
backtests and (with a user key) strategy / trade management.

## Requirements

- Node.js >= 18 (for `npx`)
- No API key is required to start. Anonymous sessions can call the read-only public tools.

## Install (stdio)

Start command:

```bash
npx -y @onvcodes/mcp-server@1.0.3
```

Client configuration:

```json
{
  "mcpServers": {
    "onv": {
      "command": "npx",
      "args": ["-y", "@onvcodes/mcp-server@1.0.3"]
    }
  }
}
```

Cline: paste the JSON block into `cline_mcp_settings.json` (MCP Servers → Installed → Configure MCP Servers).

## Optional authentication

Add environment variables to the same server entry:

| Variable | Purpose |
|---|---|
| `ONV_API_KEY` | Platform API key, sent as `X-Api-Key`. Required for account-scoped and write tools. |
| `ONV_BASE_URL` | Platform root, default `https://onv.codes`. |
| `ONV_OAUTH_TOKEN` | OAuth 2.1 access token, sent as `Authorization: Bearer`. Takes precedence over the API key. |

Example with a key:

```json
{
  "mcpServers": {
    "onv": {
      "command": "npx",
      "args": ["-y", "@onvcodes/mcp-server@1.0.3"],
      "env": { "ONV_API_KEY": "<your key>" }
    }
  }
}
```

Create a key at https://onv.codes/user — or use the hosted endpoint below, which needs no local install.

## Hosted endpoint (Streamable HTTP)

```
https://onv.codes/mcp
```

Same three credential modes apply: `Authorization: Bearer <JWT>`, `X-Api-Key: <key>`, or anonymous.

## Verify the install

Send an MCP `initialize` request over stdio. Expected:

- `serverInfo.name` = `onv-mcp-server`
- `serverInfo.version` = `1.0.3`
- the startup log line on stderr reports the number of registered platform tools (44 at this version)

Then call `tools/list` and confirm it returns the tool catalog. If the catalog is empty, the
platform endpoint was unreachable — check network access to `https://onv.codes`.

## Safety notes

- Without a key, only the read-only public subset is available; account and trading tools return 401.
- Tools that write or trade require an API key with the matching scope on the platform side.
- Do not fabricate API keys. The anonymous mode is sufficient to explore the public tools.
