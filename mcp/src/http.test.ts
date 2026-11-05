import { afterEach, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSseServer } from './http.js';
import type { Server } from 'node:http';
let server: Server | undefined;
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } });
async function setup() {
  server = createSseServer({ create: () => new McpServer({ name: 'test', version: '1' }), authorize: async token => token === 'good', publicPrefix: '/mcp' });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it('rejects URL credentials, untrusted origins and invalid bearer tokens', async () => {
  const base = await setup();
  expect((await fetch(`${base}/sse?token=good`)).status).toBe(400);
  expect((await fetch(`${base}/sse`, { headers: { authorization: 'Bearer bad' } })).status).toBe(401);
  expect((await fetch(`${base}/sse`, { headers: { authorization: 'Bearer good', origin: 'https://evil.example' } })).status).toBe(403);
  expect((await fetch(`${base}/health`)).status).toBe(200);
});
it('binds message posting to the bearer that opened the session and bounds body size', async () => {
  const base = await setup(); const controller = new AbortController();
  const stream = await fetch(`${base}/mcp/sse`, { headers: { authorization: 'Bearer good' }, signal: controller.signal });
  expect(stream.status).toBe(200); const reader = stream.body!.getReader(); const chunk = new TextDecoder().decode((await reader.read()).value);
  const endpoint = chunk.split('\n').find(line => line.startsWith('data: '))!.slice(6).trim(); expect(endpoint).toContain('/mcp/messages?sessionId=');
  expect((await fetch(`${base}${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer other', 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
  expect((await fetch(`${base}${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer good', 'content-type': 'application/json' }, body: 'x'.repeat(66000) })).status).toBe(413);
  expect((await fetch(`${base}${endpoint}`, { method: 'POST', headers: { authorization: 'Bearer good', 'content-type': 'application/json' }, body: 'not json' })).status).toBe(400);
  await reader.cancel(); controller.abort();
});
