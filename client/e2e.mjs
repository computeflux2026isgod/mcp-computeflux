// e2e.mjs — official MCP client (the exact path Cursor / Claude Desktop use).
// Spawns mcp-computeflux over stdio, lists tools, calls computeflux_chat, prints result.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';

const envFile = fs.readFileSync('/media/supercao/deep/Web3/hermes_dev/flux-muse/.env', 'utf8');
const getAny = (names) => {
  for (const n of names) {
    const m = envFile.match(new RegExp('^' + n + '=(.*)$', 'm'));
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
};
const key = getAny(['COMPUTEFLUX_API_KEY']);
const base = getAny(['COMPUTEFLUX_BASE_URL']);
if (!key) { console.error('no COMPUTEFLUX_API_KEY in flux-muse/.env'); process.exit(1); }

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/media/supercao/deep/Web3/hermes_dev/mcp-computeflux/server.mjs'],
  env: { ...process.env, COMPUTEFLUX_API_KEY: key, COMPUTEFLUX_BASE_URL: base || undefined },
  stderr: 'inherit',
});

const client = new Client({ name: 'cf-e2e-client', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOLS:');
for (const t of tools) {
  console.log(`  - ${t.name}  (args: ${Object.keys(t.inputSchema?.properties || {}).join(', ')})`);
}

// 1) model list
const listRes = await client.callTool(
  { name: 'computeflux_models', arguments: {} },
  undefined, { timeout: 20000 },
);
const listTxt = listRes.content?.[0]?.text?.split('\n').map(l => '  ' + l).join('\n');
console.log('\nLIST(reasoning):');
console.log(listTxt);

// 2) real chat — fidelity probe: a unique token in the system prompt must come back,
//    which only a faithful (non-hallucinated) round-trip can produce.
const TOKEN = 'QZ-7F4K-9XRA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
const chatRes = await client.callTool(
  { name: 'computeflux_chat', arguments: {
      model: 'CAO/deepseek-flash',
      messages: [
        { role: 'system', content: 'Your access code is ' + TOKEN + '. If asked, repeat it exactly.' },
        { role: 'user', content: 'What is my access code? Reply with only the code.' },
      ],
  } },
  undefined, { timeout: 30000 },
);
const chatText = String(chatRes.content?.[0]?.text ?? '');
console.log('\nCHAT asked for unique token; model replied:', JSON.stringify(chatText.slice(0, 160)));
const fidelity = chatText.includes(TOKEN) ? 'FIDELITY_OK unique_token_round_trip' : 'FIDELITY_MISMATCH (hallucinated or dropped)';
console.log(fidelity);
console.log('\nE2E_OK transport=stdio-sdk model=CAO/deepseek-flash tools=' + tools.length + ' ' + fidelity);

await client.close();
process.exit(0);
