#!/usr/bin/env node
// mcp-computeflux — a tiny OpenAI-compatible inference MCP server, zero dependencies.
// Exposes ComputeFlux (or any OpenAI-compatible) models as tools for MCP agents:
//   computeflux_models  — list available models
//   computeflux_chat    — chat completion (non-streaming) with tool-free simplicity
//
// Env:
//   COMPUTEFLUX_API_KEY    — required, bearer key for the OpenAI-compatible endpoint
//   COMPUTEFLUX_BASE_URL   — default https://api.computeflux.ai/v1
//                            (any OpenAI-compatible base works: this is generic)
//
// Transport: newline-delimited JSON-RPC 2.0 over stdio (MCP stdio transport).
// Only protocol messages are written to stdout; logs go to stderr.

import { createInterface } from 'node:readline';
import process from 'node:process';

const KEY = process.env.COMPUTEFLUX_API_KEY || '';
const BASE = (process.env.COMPUTEFLUX_BASE_URL || 'https://api.computeflux.ai/v1').replace(/\/$/, '');
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const log = (...a) => process.stderr.write('[mcp-computeflux] ' + a.join(' ') + '\n');

const TOOLS = [
  {
    name: 'computeflux_models',
    description: 'List the models available on the ComputeFlux (OpenAI-compatible) endpoint.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'computeflux_chat',
    description:
      'Send a chat completion request to the ComputeFlux (OpenAI-compatible) endpoint. ' +
      'Returns the assistant message text plus usage. Use model like "CAO/deepseek-flash".',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model id, e.g. "CAO/deepseek-flash"' },
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
          description: 'Chat messages (OpenAI schema).',
        },
        max_tokens: { type: 'number', description: 'Max tokens to generate (optional).', default: 512 },
        temperature: { type: 'number', description: 'Sampling temperature (optional, default 1.0).' },
      },
      required: ['model', 'messages'],
      additionalProperties: false,
    },
  },
];

async function callModel(msg) {
  // { model, messages, max_tokens?, temperature? }
  const body = {
    model: msg.model,
    messages: msg.messages,
    max_tokens: msg.max_tokens ?? 512,
    temperature: msg.temperature ?? 1.0,
    stream: false,
  };
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  const ms = Date.now() - t0;
  if (!res.ok) {
    const detail = (j.error && (j.error.message || JSON.stringify(j.error))) || `HTTP ${res.status}`;
    throw new Error(`upstream ${res.status}: ${detail}`);
  }
  const choice = j.choices?.[0] || {};
  const text = choice.message?.content ?? '';
  return `model: ${body.model}\nfinish: ${choice.finish_reason ?? 'n/a'} (${ms} ms)\nusage: ${JSON.stringify(j.usage || {})}\n\n${text}`;
}

async function handleToolCall(name, args) {
  if (name === 'computeflux_models') {
    const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`models ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const ids = (j.data || []).map((m) => m.id).filter(Boolean);
    const out = ids.length ? `available models:\n${ids.map((i) => '  ' + i).join('\n')}` : 'no models listed';
    return { content: [{ type: 'text', text: out }] };
  }
  if (name === 'computeflux_chat') {
    if (!args?.messages?.length) throw new Error('computeflux_chat requires "messages"');
    const text = await callModel(args);
    return { content: [{ type: 'text', text }] };
  }
  throw new Error(`unknown tool: ${name}`);
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function handle(req) {
  const { id, method, params } = req;
  switch (method) {
    case 'initialize': {
      const v = params?.protocolVersion;
      respond(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(v) ? v : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mcp-computeflux', version: '1.0.0' },
        instructions:
          'ComputeFlux (OpenAI-compatible) inference as tools: ' +
          'computeflux_models lists models; computeflux_chat runs a chat completion.',
      });
      return;
    }
    case 'notifications/initialized':
    case 'initialized':
      return; // notification — no response
    case 'ping':
      respond(id, {});
      return;
    case 'tools/list':
      respond(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      if (!KEY) {
        respond(id, {
          content: [{ type: 'text', text: 'This MCP server is not configured: set COMPUTEFLUX_API_KEY (and optionally COMPUTEFLUX_BASE_URL).' }],
          isError: true,
        });
        return;
      }
      try {
        const r = await handleToolCall(params?.name, params?.arguments);
        respond(id, r);
      } catch (e) {
        log('tool error:', e.message);
        respond(id, { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true });
      }
      return;
    }
    default:
      if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  const s = line.trim();
  if (!s) return;
  let req;
  try {
    req = JSON.parse(s);
  } catch {
    log('non-JSON line ignored');
    return;
  }
  try {
    await handle(req);
  } catch (e) {
    log('handler error:', e.message);
    if (req?.id !== undefined) fail(req.id, -32603, e.message);
  }
});
// No forced exit on stdin close: let in-flight upstream calls drain, then the
// empty event loop terminates the process naturally.
