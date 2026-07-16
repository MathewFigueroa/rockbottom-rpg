#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const GAME_URL = process.env.GAME_SERVER_URL ?? "http://localhost:3000";
const AGENT_TOKEN = process.env.ROCKBOTTOM_AGENT_TOKEN ?? "";

function createMcp(token = AGENT_TOKEN) {
  const server = new McpServer({ name: "rockbottom-second-wind", version: "1.0.0" });
  server.tool("observe", "Return a compact snapshot of surroundings, needs, inventory, objective, available actions, and the next decision time. Maximum 2KB and limited to six calls per minute.", {}, async () => text(await request("/api/agent/observe", token, { method: "POST" })));
  server.tool("act", "Submit exactly one action during the current decision window.", { action: z.string().min(1), params: z.record(z.unknown()).optional() }, async ({ action, params }) => text(await request("/api/agent/act", token, { method: "POST", body: JSON.stringify({ action, params: params ?? {} }) })));
  server.tool("wait_for_decision", "Block without model calls until the simulation reaches this character's next decision point.", {}, async () => {
    for (;;) {
      const result = await request("/api/agent/wait", token);
      if (result.ready) return text(result);
      const retryAt = new Date(String(result.retry_at)).getTime();
      const waitMs = Math.max(250, Math.min(15_000, retryAt - Date.now()));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  });
  server.tool("get_story_state", "Return act, objective, custody factors, and collectible progress.", {}, async () => text(await request("/api/agent/story", token)));
  server.tool("chat", "Send a proximity, crew, or direct text message.", { channel: z.enum(["proximity", "crew", "direct"]), message: z.string().min(1).max(280) }, async ({ channel, message }) => text(await request("/api/agent/chat", token, { method: "POST", body: JSON.stringify({ channel, message }) })));
  server.tool("plan_note", "Persist one scratchpad note. The server retains the newest 20 notes so small-context agents can resume.", { text: z.string().min(1).max(400) }, async ({ text: note }) => text(await request("/api/agent/plan-note", token, { method: "POST", body: JSON.stringify({ text: note }) })));
  return server;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  if (!token) throw new Error("ROCKBOTTOM_AGENT_TOKEN is required");
  const response = await fetch(`${GAME_URL}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok && response.status !== 202) throw new Error(JSON.stringify(body));
  return body;
}

function text(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }] }; }

async function startStdio() {
  const server = createMcp();
  await server.connect(new StdioServerTransport());
}

async function startSse() {
  const transports = new Map<string, SSEServerTransport>();
  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { ok: true, service: "rockbottom-mcp", transport: "sse" });
    if (request.method === "GET" && url.pathname === "/sse") {
      const token = url.searchParams.get("token") ?? AGENT_TOKEN;
      if (!token) return sendJson(response, 401, { error: "agent_token_required" });
      const transport = new SSEServerTransport("/messages", response);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => transports.delete(transport.sessionId);
      await createMcp(token).connect(transport);
      return;
    }
    if (request.method === "POST" && url.pathname === "/messages") {
      const transport = transports.get(url.searchParams.get("sessionId") ?? "");
      if (!transport) return sendJson(response, 404, { error: "session_not_found" });
      const body = await readJson(request);
      await transport.handlePostMessage(request, response, body);
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });
  const port = Number(process.env.MCP_PORT ?? 3001);
  httpServer.listen(port, "0.0.0.0", () => process.stderr.write(`ROCKBOTTOM MCP SSE listening on :${port}\n`));
}

function sendJson(response: ServerResponse, status: number, body: unknown) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
async function readJson(request: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return JSON.parse(Buffer.concat(chunks).toString("utf8")); }

if (process.env.MCP_TRANSPORT === "sse") await startSse(); else await startStdio();
