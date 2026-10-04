# mcp-computeflux

Zero-dependency [MCP](https://modelcontextprotocol.io) (Model Context Protocol)
server. Give any MCP host — Cursor, Claude Desktop, Windsurf, any MCP client — one
OpenAI-compatible endpoint, and call models on **ComputeFlux** as plain tools:
list what's available, then run a chat completion.

> Your MCP agents hit flash-tier models over one OpenAI-compatible endpoint.

- ~175 lines of Node 18+, **no `npm install` to run the server** (only the optional
  `client/` e2e harness pulls SDK deps).
- Backend-agnostic: point it at *any* OpenAI-compatible API — ComputeFlux is the
  default, not the only target.
- **ComputeFlux** is an OpenAI-compatible, TEE-verifiable multi-model inference
  gateway deployed on the Polkadot testnet.

## Tools

| Tool | What it does |
|---|---|
| `computeflux_models` | Lists the model ids served by the endpoint. |
| `computeflux_chat`  | Runs a non-streaming chat completion (`model` + OpenAI `messages`; optional `max_tokens`, `temperature`). Returns model, finish reason, latency, usage, and the assistant text. |

## Configuration (env)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `COMPUTEFLUX_API_KEY`   | yes  | —  | Bearer key for the endpoint. |
| `COMPUTEFLUX_BASE_URL`  | no   | `https://api.computeflux.ai/v1` | Any OpenAI-compatible base URL. |

```bash
export COMPUTEFLUX_API_KEY="your_c***_key"
# export COMPUTEFLUX_BASE_URL="https://your-openai-compat-host/v1"   # optional
```

## Install

Published on the **official MCP Registry** (`.mcpb` bundle, no npm step):

`io.github.computeflux2026isgod/mcp-computeflux` — listed on the [official MCP Registry](https://registry.modelcontextprotocol.io) (search by this name).

Any MCP client / agent that supports registry install (`mcp add`, Cursor, Claude Desktop,
Claude Code) can pull it by name. Direct git-clone quickstart:

```bash
git clone https://github.com/computeflux2026isgod/mcp-computeflux
export COMPUTEFLUX_API_KEY="your_...key"
node /path/to/mcp-computeflux/server.mjs   # stdio JSON-RPC
```

mcpServers snippet:

```json
{
  "mcpServers": {
    "computeflux": {
      "command": "node",
      "args": ["/path/to/mcp-computeflux/server.mjs"],
      "env": { "COMPUTEFLUX_API_KEY": "your_c***_key" }
    }
  }
}
```

## Local e2e (optional)

`client/` contains a tiny harness using the **official MCP SDK** — the exact path
Cursor / Claude Desktop use. It spawns the server over stdio, lists tools, and runs
one chat completion with a unique-token round-trip fidelity check.

```bash
cd client && npm install && npm run e2e   # expects COMPUTEFLUX_API_KEY in the .env it points to
```

## Transport

Newline-delimited JSON-RPC 2.0 over **stdio**. Only protocol messages are written to
stdout; logs go to stderr.

## License

MIT
