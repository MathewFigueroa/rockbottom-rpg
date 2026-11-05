import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
interface Options { create: (token: string) => McpServer; authorize: (token: string) => Promise<boolean>; allowedHosts?: string[]; allowedOrigins?: string[]; publicPrefix?: string; maxSessions?: number }
const digest = (token: string) => createHash('sha256').update(token).digest();
function json(response: ServerResponse, status: number, body: unknown) { if (!response.headersSent) response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function readJson(request: IncomingMessage) {
  if (Number(request.headers['content-length'] ?? 0) > 65536) { request.resume(); throw new HttpError(413, 'body_too_large'); }
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > 65536) throw new HttpError(413, 'body_too_large'); chunks.push(buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'invalid_json'); }
}
export function createSseServer(options: Options) {
  const sessions = new Map<string, { hash: Buffer; transport: SSEServerTransport; server: McpServer }>();
  const rates = new Map<string, { start: number; count: number }>();
  const hosts = new Set(options.allowedHosts ?? ['localhost', '127.0.0.1', '[::1]']);
  const origins = new Set(options.allowedOrigins ?? ['http://localhost:5173']);
  const prefix = (options.publicPrefix ?? '').replace(/\/$/, '');
  const httpServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (!hosts.has(url.hostname)) throw new HttpError(421, 'unrecognized_host');
      if (request.headers.origin && !origins.has(request.headers.origin)) throw new HttpError(403, 'origin_not_allowed');
      if (request.headers.origin) { response.setHeader('Access-Control-Allow-Origin', request.headers.origin); response.setHeader('Vary', 'Origin'); }
      if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, last-event-id', 'Access-Control-Max-Age': '600' }); response.end(); return; }
      const path = prefix && url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : url.pathname;
      if (request.method === 'GET' && path === '/health') return json(response, 200, { ok: true, service: 'rockbottom-mcp', transport: 'sse' });
      const address = request.socket.remoteAddress ?? 'unknown'; const now = Date.now();
      for (const [key, rate] of rates) if (now - rate.start > 60000) rates.delete(key);
      const rate = rates.get(address) ?? { start: now, count: 0 }; if ((!rates.has(address) && rates.size >= 1024) || ++rate.count > 600) throw new HttpError(429, 'rate_limited'); rates.set(address, rate);
      if (url.searchParams.has('token')) throw new HttpError(400, 'tokens_must_use_authorization_headers');
      const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token || token.length > 256) throw new HttpError(401, 'agent_token_required');
      if (request.method === 'GET' && path === '/sse') {
        if (sessions.size >= (options.maxSessions ?? 128)) throw new HttpError(503, 'session_capacity_reached');
        const hash = digest(token); if ([...sessions.values()].filter(s => timingSafeEqual(s.hash, hash)).length >= 4) throw new HttpError(429, 'agent_session_limit');
        if (!await options.authorize(token)) throw new HttpError(401, 'invalid_agent_token');
        const transport = new SSEServerTransport(`${prefix}/messages`, response);
        const server = options.create(token); sessions.set(transport.sessionId, { hash, transport, server });
        response.once('close', () => { sessions.delete(transport.sessionId); void server.close(); });
        await server.connect(transport); return;
      }
      if (request.method === 'POST' && path === '/messages') {
        const session = sessions.get(url.searchParams.get('sessionId') ?? '');
        if (!session) throw new HttpError(404, 'session_not_found');
        if (!timingSafeEqual(session.hash, digest(token))) throw new HttpError(403, 'session_owner_required');
        await session.transport.handlePostMessage(request, response, await readJson(request)); return;
      }
      throw new HttpError(404, 'not_found');
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      json(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'mcp_request_failed' });
    }
  });
  httpServer.requestTimeout = 10000; httpServer.headersTimeout = 10000; httpServer.keepAliveTimeout = 5000;
  return httpServer;
}
