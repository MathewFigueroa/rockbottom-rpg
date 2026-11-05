#!/usr/bin/env node
import { createSseServer } from "./http.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GAME_URL = process.env.GAME_SERVER_URL ?? "http://localhost:3000";
const AGENT_TOKEN = process.env.ROCKBOTTOM_AGENT_TOKEN ?? "";

function createMcp(token = AGENT_TOKEN) {
  const server = new McpServer({ name: "rockbottom-second-wind", version: "1.0.0" });
  server.tool("observe", "Return a compact snapshot of surroundings, needs, inventory, objective, available actions, and the next decision time. Maximum 2KB and limited to six calls per minute.", {}, async () => text(await request("/api/agent/observe", token, { method: "POST" })));
  server.tool("act", "Submit exactly one action during the current decision window.", { action: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }, async ({ action, params }) => text(await request("/api/agent/act", token, { method: "POST", body: JSON.stringify({ action, params: params ?? {} }) })));
  server.tool("wait_for_decision", "Block without model calls until the simulation reaches this character's next decision point.", {}, async (_args, extra) => {
    while (!extra.signal.aborted) {
      const result = await request("/api/agent/wait", token, { signal: extra.signal });
      if (result.ready) return text(result);
      const retryAt = new Date(String(result.retry_at)).getTime();
      const waitMs = Math.max(250, Math.min(15_000, Number(result.retry_after_ms) || retryAt - Date.now()));
      await new Promise<void>(resolve => {
        const stop = () => { clearTimeout(timer); extra.signal.removeEventListener('abort', stop); resolve(); };
        const timer = setTimeout(stop, waitMs); extra.signal.addEventListener('abort', stop, { once: true });
        if (extra.signal.aborted) stop();
      });
    }
    return text({ cancelled: true });
  });
  server.tool("introduce_agent", "Label this connection for spectator attribution. The label is self-described, not provider verification.", { modelLabel: z.string().min(1).max(80) }, async ({ modelLabel }) => text(await request("/api/agent/identity", token, { method: "POST", body: JSON.stringify({ modelLabel }) })));
  server.tool("get_story_state", "Return the viewer brief, needs, legal/market/service decisions, quests, records and consequences. Choose freely within the available contracts; spectator summaries are optional and never hidden reasoning.", {}, async () => text(await request("/api/agent/story", token)));
  server.tool("chat", "Send a proximity, crew, or direct text message.", { channel: z.enum(["proximity", "crew", "direct"]), message: z.string().min(1).max(280), recipientId: z.string().optional(), crewId: z.string().optional() }, async ({ channel, message, recipientId, crewId }) => text(await request("/api/agent/chat", token, { method: "POST", body: JSON.stringify({ channel, message, recipientId, crewId }) })));
  server.tool("read_chat", "Read public and authorized crew/direct chat only.", {}, async () => text(await request("/api/agent/chat", token)));
  server.tool("plan_note", "Persist one scratchpad note. The server retains the newest 20 notes so small-context agents can resume.", { text: z.string().min(1).max(400) }, async ({ text: note }) => text(await request("/api/agent/plan-note", token, { method: "POST", body: JSON.stringify({ text: note }) })));
  return server;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  if (!token) throw new Error("ROCKBOTTOM_AGENT_TOKEN is required");
  const response = await fetch(`${GAME_URL}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(15000), headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
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
  const httpServer = createSseServer({
    create: createMcp,
    authorize: async token => { try { await request('/api/agent/wait', token); return true; } catch { return false; } },
    allowedHosts: process.env.MCP_ALLOWED_HOSTS?.split(','),
    allowedOrigins: process.env.MCP_ALLOWED_ORIGINS?.split(','),
    publicPrefix: process.env.MCP_PUBLIC_PREFIX,
  });
  const port = Number(process.env.MCP_PORT ?? 3001);
  httpServer.listen(port, process.env.MCP_HOST ?? '127.0.0.1', () => process.stderr.write(`ROCKBOTTOM MCP SSE listening on :${port}\n`));
  const close = () => { httpServer.closeAllConnections(); httpServer.close(); };
  process.once('SIGTERM', close); process.once('SIGINT', close);
}

if (process.env.MCP_TRANSPORT === "sse") await startSse(); else await startStdio();
