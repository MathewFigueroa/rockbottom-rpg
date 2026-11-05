import { reviewCase } from "./moderation.js";
import { chatFor, sendChat } from "./chat.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { loadPacks } from "./packs.js";
import { GameClock, MemoryStore } from "./store.js";
import { eligibleRecords } from "./records.js";
import { lifeView } from "./systems.js";
import { campaignView } from "./campaign.js";
import { storyView, choices } from "./story.js";
import { PostgresRepository } from "./postgres.js";
import { PersistenceCoordinator } from "./persistence.js";
import { Simulation } from "./simulation.js";

const postgresUrl = process.env.DATABASE_URL?.match(/^postgres(?:ql)?:\/\//) ? process.env.DATABASE_URL : undefined;
if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "change-me-now" || (process.env.ADMIN_SESSION_SECRET?.length ?? 0) < 32 || !process.env.CLIENT_ORIGIN || (!process.env.SAVE_PATH && !postgresUrl))) throw new Error("Production requires ADMIN_PASSWORD, a 32-character ADMIN_SESSION_SECRET, CLIENT_ORIGIN and SAVE_PATH or PostgreSQL DATABASE_URL");
const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
const repository = postgresUrl ? await PostgresRepository.connect(postgresUrl) : undefined;
const store = new MemoryStore(postgresUrl ? undefined : process.env.SAVE_PATH);
const restored = await repository?.load();
if (restored) store.restore(restored);
const clock = new GameClock();
if (store.clockState) clock.update(store.clockState);
const persistence = new PersistenceCoordinator(store, clock, repository);
store.clockState = clock.read();
const sim = new Simulation(store, clock);
const packs = await loadPacks();
const adminSessions = new Map<string, number>();

await app.register(cors, { origin: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174").split(","), credentials: true });
await app.register(cookie, { secret: process.env.ADMIN_SESSION_SECRET ?? "dev-only-secret-change-this-32-chars" });
await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
await app.register(websocket);

const operations = new WeakMap<import("fastify").FastifyRequest, { release: () => void; before: ReturnType<MemoryStore["snapshot"]> }>();
app.addHook("preHandler", async (request, reply) => {
  if (request.url.startsWith('/ws/') || request.url === '/health') return;
  const release = await persistence.acquire();
  if (request.raw.aborted || reply.raw.destroyed) { release(); return reply.code(499).send({ error: "request_cancelled" }); }
  if (!persistence.healthy || repository?.healthy === false) {
    release(); return reply.code(503).send({ error: 'persistence_unavailable' });
  }
  store.clockState = clock.read();
  operations.set(request, { release, before: store.snapshot() });
});

// Owner credentials are separate from agent credentials and never accepted from request bodies.
app.addHook("preHandler", async (request, reply) => {
  const path = request.url.split("?")[0]!;
  if (request.method === "POST" && request.body === null) return reply.code(400).send({ error: "body_required" });
  const match = path.match(/^\/api\/characters\/([^/]+)/);
  const body = request.body as Record<string, unknown> | undefined;
  let id = match?.[1];
  if (["/api/chat", "/api/crews", "/api/reports"].includes(path) && request.method === "POST") id = String(body?.characterId ?? body?.reporterId ?? "");
  const alliance = path.match(/^\/api\/crews\/([^/]+)\/ally$/);
  if (alliance) {
    id = String(body?.characterId ?? '');
    if (!store.crews.get(alliance[1]!)?.members.includes(id)) return reply.code(403).send({ error: 'crew_membership_required' });
  }
  if (id !== undefined) {
    const ban = store.bans.get(id);
    if (ban && (!ban.until || Date.parse(ban.until) > Date.now()) && (ban.kind === 'game' || path === '/api/chat')) return reply.code(403).send({ error: 'account_restricted' });
    const credential = request.cookies[`rb_owner_${id}`];
    if (!credential || store.owners.get(id) !== createHash("sha256").update(credential).digest("hex")) return reply.code(401).send({ error: "owner_auth_required" });
  }
});
app.addHook("onSend", async (request, reply, payload) => {
  const operation = operations.get(request);
  if (operation) {
    operations.delete(request);
    try {
      if (reply.statusCode >= 500) persistence.restore(operation.before);
      else if (request.method === 'POST') await persistence.commit(`${request.method} ${request.routeOptions.url}`);
    } catch (error) {
      persistence.restore(operation.before);
      // Never return an owner cookie for a character whose creation was not acknowledged.
      reply.removeHeader('set-cookie');
      throw new Error("persistence_unavailable");
    } finally { operation.release(); }
  }
  // Tokens and private notes must never escape through action, watch, or admin snapshots.
  if (typeof payload === "string" && reply.getHeader("content-type")?.toString().includes("application/json")) {
    const ownerView = /^\/api\/(characters|demo)\//.test(request.url) || request.url === "/api/characters";
    return JSON.stringify(JSON.parse(payload), (key, value) => key === "agentToken" && !ownerView ? undefined : key === "lastSafeCheckpoint" ? undefined : key === "planNotes" && !ownerView ? [] : value);
  }
  return payload;
});
function grantOwner(id: string, reply: import("fastify").FastifyReply) {
  const token = randomBytes(32).toString("base64url");
  store.owners.set(id, createHash("sha256").update(token).digest("hex"));
  reply.setCookie(`rb_owner_${id}`, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2592000 });
}

app.get("/health", async (_request, reply) => { const ok = persistence.healthy && repository?.healthy !== false; return reply.code(ok ? 200 : 503).send({ ok, persistence: postgresUrl ? "postgresql" : process.env.SAVE_PATH ? "file" : "memory", service: "rockbottom-server", clock: clock.read(), packs: packs.length }); });

app.post("/api/characters", async (request, reply) => {
  const body = request.body as { name?: string; sex?: "male" | "female"; childName?: string; childAge?: number; brief?: string; shareSummaries?: boolean };
  if (!body || !["male", "female"].includes(body.sex ?? "") || typeof body.name !== "string" || typeof body.childName !== "string" || !Number.isFinite(body.childAge ?? 8)) return reply.code(400).send({ error: "name, sex, childName, and childAge are required" });
  const character = store.createCharacter({ name: body.name, sex: body.sex!, childName: body.childName, childAge: body.childAge ?? 8, brief: typeof body.brief === "string" ? body.brief : undefined, shareSummaries: body.shareSummaries === true });
  character.nextDecisionAt = clock.now();
  grantOwner(character.id, reply);
  return reply.code(201).send(character);
});

app.get<{ Params: { id: string } }>("/api/characters/:id", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  return character ? { ...character, campaignView: campaignView(character), lifeView: lifeView(character, store, clock.nowMs()), storyChoices: choices(character) } : reply.code(404).send({ error: "character_not_found" });
});

app.post<{ Params: { id: string } }>("/api/characters/:id/mode", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  const mode = (request.body as { mode?: string } | undefined)?.mode;
  if (mode !== "manual" && mode !== "agent") return reply.code(400).send({ error: "invalid_mode" });
  character.mode = mode;

  return character;
});

app.post<{ Params: { id: string } }>("/api/characters/:id/action", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  const body = request.body as { action?: string; params?: Record<string, unknown> };
  const result = sim.act(character, body.action ?? "", body.params ?? {}, false);
  return reply.code(result.ok ? 200 : 409).send(result);
});

app.get<{ Params: { id: string } }>("/api/characters/:id/hearing", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  return character ? sim.hearing(character) : reply.code(404).send({ error: "character_not_found" });
});

function allRecords() { return packs.flatMap(pack => Array.isArray(pack.content.tapes) ? pack.content.tapes as Array<{ id: string; name: string; content: string }> : []); }
app.get<{ Params: { id: string } }>("/api/characters/:id/records", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  return character ? allRecords().filter(record => character.tapes.includes(record.id)) : reply.code(404).send({ error: 'character_not_found' });
});
app.post<{ Params: { id: string } }>("/api/characters/:id/director", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: 'character_not_found' });
  const body = request.body as { brief?: unknown; shareSummaries?: unknown };
  if (typeof body?.brief !== 'string' || typeof body.shareSummaries !== 'boolean') return reply.code(400).send({ error: 'brief_and_sharing_required' });
  character.director = { brief: body.brief.trim().slice(0, 1000), shareSummaries: body.shareSummaries, modelLabel: character.director?.modelLabel ?? 'Unspecified agent' };
  if (!body.shareSummaries) delete character.agentVoice;
  return { ok: true };
});
app.post('/api/agent/identity', async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers['x-agent-token'] as string | undefined);
  const label = (request.body as { modelLabel?: unknown })?.modelLabel;
  if (!character) return reply.code(401).send({ error: 'invalid_agent_token' });
  if (typeof label !== 'string' || !label.trim()) return reply.code(400).send({ error: 'model_label_required' });
  character.director ??= { brief: 'Follow the consequences of your choices.', shareSummaries: false, modelLabel: '' };
  character.director.modelLabel = label.trim().slice(0, 80);
  return { ok: true, label: character.director.modelLabel, attribution: 'self-described' };
});

app.post<{ Params: { id: string } }>('/api/characters/:id/agent-token', async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: 'character_not_found' });
  character.agentToken = `rb_${randomBytes(24).toString('base64url')}`;
  return { agentToken: character.agentToken };
});
app.post<{ Params: { id: string } }>('/api/characters/:id/recovery-code', async (request, reply) => {
  if (!store.characters.has(request.params.id)) return reply.code(404).send({ error: 'character_not_found' });
  const code = randomBytes(32).toString('base64url'); store.ownerRecovery.set(request.params.id, createHash('sha256').update(code).digest('hex'));
  return { recoveryCode: code };
});
app.post('/api/recover', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
  const body = request.body as { id?: unknown; recoveryCode?: unknown };
  if (typeof body?.id !== 'string' || typeof body.recoveryCode !== 'string' || body.recoveryCode.length > 128) return reply.code(401).send({ error: 'invalid_recovery_credentials' });
  const expected = store.ownerRecovery.get(body.id); const actual = createHash('sha256').update(body.recoveryCode).digest('hex');
  if (!expected || !store.characters.has(body.id) || !safeEqual(expected, actual)) return reply.code(401).send({ error: 'invalid_recovery_credentials' });
  grantOwner(body.id, reply);
  return { id: body.id };
});

app.get("/api/shards", async () => [{ id: "halvern-1", name: "Halvern City", players: store.characters.size, capacity: 64, public: true }]);
app.get("/api/packs", async () => packs.map((pack) => ({ ...pack.manifest, enabled: !store.packDisabled.has(pack.manifest.id) })));
app.get("/api/content/tapes", async () => packs.flatMap((pack) => Array.isArray(pack.content.tapes) ? pack.content.tapes : []));
app.get("/api/clock", async () => clock.read());

app.post("/api/agent/observe", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  const result = sim.observe(character);
  const status = result.ok ? 200 : 429;
  const json = JSON.stringify(result);
  if (Buffer.byteLength(json) > 2048) return reply.code(500).send({ error: "observe_snapshot_exceeded_2kb" });
  return reply.code(status).type("application/json").send(json);
});

app.post("/api/agent/act", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  if (character.mode !== "agent") return reply.code(409).send({ error: "character_not_in_agent_mode" });
  const body = request.body as { action?: string; params?: Record<string, unknown> };
  const result = sim.act(character, body.action ?? "", body.params ?? {}, true);
  return reply.code(result.ok ? 200 : 409).send(result);
});

app.get("/api/agent/wait", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  if (clock.nowMs() >= new Date(character.nextDecisionAt).getTime()) return { ready: true, next_decision_at: character.nextDecisionAt };
  return reply.code(202).send({ ready: false, retry_at: character.nextDecisionAt, retry_after_ms: clock.read().paused ? 5000 : Math.max(250, Math.min(15000, (Date.parse(character.nextDecisionAt) - clock.nowMs()) / clock.read().scale)) });
});

app.get("/api/agent/story", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  return { character: { name: character.name, mode: character.mode, status: character.status, needs: character.needs, cash: character.cash, housing: character.housing, record: character.record, nextDecisionAt: character.nextDecisionAt }, director: character.director, agent_memory: character.planNotes, messages: chatFor(store, character.id).slice(-10), recent_events: character.chronicle?.slice(-12) ?? [], archive: allRecords().filter(record => character.tapes.includes(record.id)), life: lifeView(character, store, clock.nowMs()), campaign: campaignView(character), narrative: storyView(character), act: character.act, quest_step: character.questStep, objective: character.activeObjective, custody: sim.hearing(character), tapes: character.tapes.length };
});

app.post("/api/agent/plan-note", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  const text = String((request.body as { text?: string }).text ?? "").trim().slice(0, 400);
  if (!text) return reply.code(400).send({ error: "empty_note" });
  character.planNotes.unshift({ at: clock.now(), text });
  character.planNotes = character.planNotes.slice(0, 20);
  return { ok: true, notes: character.planNotes };
});

app.post("/api/agent/chat", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  const ban = store.bans.get(character.id);
  if (ban && (!ban.until || Date.parse(ban.until) > Date.now())) return reply.code(403).send({ error: "communications_restricted" });
  const result = sendChat(store, character.id, request.body as Parameters<typeof sendChat>[2], clock.now());
  return result.ok ? result.entry : reply.code(400).send({ error: result.error });
});

app.get<{ Params: { id: string } }>("/api/watch/:id", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  return { clock: clock.read(), character: publicCharacter(character), actions: character.actionLog, planNotes: [], spectatorCount: character.spectatorCount };
});

app.post<{ Params: { id: string; tapeId: string } }>("/api/characters/:id/tapes/:tapeId", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  const allTapes = packs.flatMap((pack) => Array.isArray(pack.content.tapes) ? pack.content.tapes as Array<{ id?: string }> : []);
  if (!allTapes.some((tape) => tape.id === request.params.tapeId)) return reply.code(404).send({ error: "tape_not_found" });
  if (!eligibleRecords(character).includes(request.params.tapeId) && !character.tapes.includes(request.params.tapeId)) return reply.code(403).send({ error: "record_not_discovered" });
  if (!character.tapes.includes(request.params.tapeId)) character.tapes.push(request.params.tapeId);
  return { collected: character.tapes.length, complete: character.tapes.length === allTapes.length, tapeId: request.params.tapeId };
});

app.get<{ Params: { id: string } }>("/ws/watch/:id", { websocket: true }, (socket, request) => {
  const character = store.characters.get(request.params.id);
  if (!character) return socket.close(1008, "character_not_found");
  if (character.spectatorCount >= 32 || [...store.characters.values()].reduce((sum, c) => sum + c.spectatorCount, 0) >= 128) return socket.close(1013, 'spectator_capacity');
  character.spectatorCount += 1;
  const send = () => {
    if (!persistence.healthy || repository?.healthy === false) { socket.close(1011, 'persistence_unavailable'); return; }
    if (persistence.busy) return;
    const current = store.characters.get(request.params.id);
    if (current && socket.readyState === 1) socket.send(JSON.stringify({ clock: clock.read(), character: publicCharacter(current), actions: current.actionLog, planNotes: [], spectatorCount: current.spectatorCount }));
  };
  send();
  const timer = setInterval(send, 1000);
  socket.on("close", () => { clearInterval(timer); const current = store.characters.get(request.params.id); if (current) current.spectatorCount = Math.max(0, current.spectatorCount - 1); });
});

app.post("/api/crews", async (request, reply) => {
  const body = request.body as { name?: string; characterId?: string };
  if (!body.name || !body.characterId || !store.characters.has(body.characterId)) return reply.code(400).send({ error: "name_and_character_required" });
  const crew = { id: randomUUID(), name: body.name.slice(0, 28), members: [body.characterId], allies: [], feuds: [], tags: [], reputation: 0 };
  store.crews.set(crew.id, crew);
  return reply.code(201).send(crew);
});

app.post<{ Params: { id: string } }>("/api/crews/:id/ally", async (request, reply) => {
  const crew = store.crews.get(request.params.id);
  const other = store.crews.get((request.body as { crewId?: string }).crewId ?? "");
  if (!crew || !other) return reply.code(404).send({ error: "crew_not_found" });
  if (crew.id === other.id) return reply.code(400).send({ error: 'cannot_ally_self' });
  if (crew.allies.includes(other.id) && other.allies.includes(crew.id)) return { mutual: true, alreadyAllied: true };
  if (other.allianceRequests?.includes(crew.id)) {
    if (!crew.allies.includes(other.id)) crew.allies.push(other.id);
    if (!other.allies.includes(crew.id)) other.allies.push(crew.id);
    other.allianceRequests = other.allianceRequests.filter(id => id !== crew.id);
    return { crew: { id: crew.id, allies: crew.allies }, other: { id: other.id, allies: other.allies }, mutual: true };
  }
  if (!(crew.allianceRequests ??= []).includes(other.id)) crew.allianceRequests.push(other.id);
  return reply.code(202).send({ pending: true, mutual: false });
});

app.post("/api/chat", async (request, reply) => {
  const body = request.body as { characterId?: string; channel?: string; message?: string };
  if (!body.characterId || !store.characters.has(body.characterId)) return reply.code(404).send({ error: "character_not_found" });
  const result = sendChat(store, body.characterId, request.body as Parameters<typeof sendChat>[2], clock.now());
  return result.ok ? reply.code(201).send(result.entry) : reply.code(400).send({ error: result.error });
});
app.get('/api/chat', async () => chatFor(store));
app.get('/api/people', async () => [...store.characters.values()].map(c => ({ id: c.id, name: c.name, location: c.location })));
app.get<{ Params: { id: string } }>('/api/characters/:id/chat', async request => chatFor(store, request.params.id));
app.get('/api/agent/chat', async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers['x-agent-token'] as string | undefined);
  return character ? chatFor(store, character.id) : reply.code(401).send({ error: 'invalid_agent_token' });
});

app.post("/api/reports", async (request, reply) => {
  const body = request.body as { reporterId?: string; targetId?: string; reason?: string; fingerprint?: string };
  if (!body.reporterId || !body.targetId || !store.characters.has(body.targetId)) return reply.code(400).send({ error: "invalid_report" });
  const previous = store.moderationCases.filter((item) => item.targetId === body.targetId && item.status !== "overturned").length;
  const flagNumber = Math.min(3, previous + 1);
  const fingerprintHash = createHash('sha256').update(`account:${body.targetId}:${process.env.ADMIN_SESSION_SECRET ?? 'dev'}`).digest('hex');
  const moderationCase = { id: randomUUID(), reporterId: body.reporterId, targetId: body.targetId, reason: String(body.reason ?? "unspecified").slice(0, 500), evidence: { audioClip: "data:audio/wav;base64,UklGRg==", chat: store.chat.filter((entry) => entry.characterId === body.targetId).slice(-10).map((entry) => entry.message), fingerprintHash }, status: "pending" as const, flagNumber, penalty: "No penalty pending review", appealNotes: "", createdAt: clock.now() };
  store.moderationCases.push(moderationCase);

  return reply.code(201).send({ id: moderationCase.id, status: moderationCase.status, penalty: moderationCase.penalty, createdAt: moderationCase.createdAt });
});

app.post("/api/admin/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
  const body = request.body as { username?: string; password?: string };
  const expectedUser = process.env.ADMIN_USER ?? "warden";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "change-me-now";
  if (!safeEqual(body.username ?? "", expectedUser) || !safeEqual(body.password ?? "", expectedPass)) return reply.code(401).send({ error: "invalid_credentials" });
  const session = randomBytes(24).toString("base64url");
  for (const [id, expiry] of adminSessions) if (expiry <= Date.now()) adminSessions.delete(id);
  adminSessions.set(session, Date.now() + 28800000);
  reply.setCookie("rb_admin", session, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 28_800 });
  return { ok: true };
});

app.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/api/admin/") || request.url === "/api/admin/login") return;
  const testSecret = request.headers["x-admin-secret"];
  const valid = (adminSessions.get(request.cookies.rb_admin ?? "") ?? 0) > Date.now() || (process.env.NODE_ENV !== "production" && testSecret === "dev-admin");
  if (!valid) return reply.code(401).send({ error: "admin_auth_required" });
});

app.get("/api/admin/dashboard", async () => ({ clock: clock.read(), players: [...store.characters.values()].map(publicCharacter), packs: packs.map((pack) => ({ ...pack.manifest, enabled: !store.packDisabled.has(pack.manifest.id) })), moderation: store.moderationCases, crews: [...store.crews.values()], economy: { faucets: store.cashFaucets, sinks: store.cashSinks }, spectators: [...store.characters.values()].reduce((sum, item) => sum + item.spectatorCount, 0) }));
app.post("/api/admin/clock", async (request) => clock.update(request.body as Parameters<GameClock["update"]>[0]));
app.post<{ Params: { id: string } }>("/api/admin/packs/:id/toggle", async (request) => {
  if (store.packDisabled.has(request.params.id)) store.packDisabled.delete(request.params.id); else store.packDisabled.add(request.params.id);
  return { id: request.params.id, enabled: !store.packDisabled.has(request.params.id), note: "Pack enablement is persisted by production repository adapters and applied on next safe world reload." };
});
app.post<{ Params: { id: string } }>("/api/admin/moderation/:id", async (request, reply) => {
  const moderationCase = store.moderationCases.find((item) => item.id === request.params.id);
  if (!moderationCase) return reply.code(404).send({ error: "case_not_found" });
  const body = request.body as { decision?: "upheld" | "overturned"; appealNotes?: string };
  if (!["upheld", "overturned"].includes(body.decision ?? "")) return reply.code(400).send({ error: "decision_required" });
  if (body.appealNotes !== undefined && typeof body.appealNotes !== 'string') return reply.code(400).send({ error: 'invalid_notes' });
  const result = reviewCase(store, moderationCase, body.decision!, body.appealNotes ?? '', Date.now());
  if (!result.ok) return reply.code(400).send({ error: result.error });
  return moderationCase;
});

// Deterministic setup endpoints are available outside production for E2E and screenshot capture.
app.post<{ Params: { scene: string } }>("/api/demo/:scene", async (request, reply) => {
  if (process.env.NODE_ENV === "production") return reply.code(404).send();
  const character = store.createCharacter({ name: "Jamie", sex: "female", childName: "Riley", childAge: 8 });
  const scene = request.params.scene;
  if (["day-labor", "sam", "night", "hearing", "agent", "crew", "army", "reveal", "honor"].includes(scene)) {
    character.cash = 126;
    character.housing = "shelter";
    character.shiftsWorked = 4;
    character.shelterDays = 7;
    character.sobrietyDays = 30;
    character.incomeConsistency = 76;
    character.visitationAttendance = 100;
    character.questStep = 3;
  }
  if (scene === "day-labor") { character.questStep = 2; character.location = "Halvern Day-Labor Lot"; character.activeObjective = "Hold the bed for 7 days and work 4 shifts. Bed 4/7, shifts 3/4."; }
  if (scene === "sam") { character.act = 2; character.questStep = 4; character.location = "Okafor Pawn & Repair"; character.activeObjective = "The Flip: inspect the brass lamp and agree on a resale floor."; }
  if (scene === "night") { character.act = 2; character.questStep = 4; character.location = "Market Row"; character.activeObjective = "Regulars: finish the last courier route before the night window closes."; }
  if (scene === "hearing") { character.act = 2; character.questStep = 4; character.location = "Whitfield Courthouse"; character.activeObjective = "Day Thirty: hear how the court weighs the five custody factors."; }
  if (scene === "agent") { character.mode = "agent"; character.questStep = 2; character.activeObjective = "Hold the bed for 7 days and work 4 shifts. Bed 4/7, shifts 3/4."; character.actionLog.unshift({ at: clock.now(), action: "day_labor", detail: "Rule agent selected the next reliable shift." }); }
  if (scene === "crew") { character.act = 2; character.questStep = 4; character.location = "Riverfront East"; character.activeObjective = "Crew Up: place the Kings tag away from the memorial wall."; }
  if (scene === "army" || scene === "honor") { character.act = 2; character.location = "Fort Halvern Annex"; character.activeObjective = "The Score: complete the aptitude assessment."; }
  if (scene === "reveal") { character.act = 3; character.tapes = Array.from({ length: 24 }, (_, index) => `tape-${String(index + 1).padStart(2, "0")}`); }
  if (scene === "honor") character.status = "dead";
  character.nextDecisionAt = clock.now();
  grantOwner(character.id, reply);
  return reply.code(201).send(character);
});

async function background(reason: string, tick = false) {
  if (persistence.busy || !persistence.healthy || repository?.healthy === false) return;
  const release = await persistence.acquire();
  store.clockState = clock.read();
  const before = store.snapshot();
  try {
    if (tick) sim.tick();
    if (!tick || JSON.stringify(before) !== JSON.stringify(store.snapshot())) await persistence.commit(reason);
  } catch (error) { persistence.restore(before); app.log.error(error, 'World persistence failed; requests disabled'); }
  finally { release(); }
}
const ticker = setInterval(() => { void background('simulation_tick', true); }, 250);
const saver = setInterval(() => { void background('clock_checkpoint'); }, 5000);
app.addHook("onClose", async () => {
  clearInterval(ticker); clearInterval(saver);
  const release = await persistence.acquire();
  try { if (persistence.healthy && repository?.healthy !== false) await persistence.commit('shutdown'); }
  finally { release(); await repository?.close(); }
});

function agentCharacter(authorization?: string, direct?: string) {
  const token = direct ?? authorization?.replace(/^Bearer\s+/i, "");
  const character = store.getByToken(token);
  const ban = character && store.bans.get(character.id);
  return ban && ban.kind === "game" && (!ban.until || Date.parse(ban.until) > Date.now()) ? undefined : character;
}

function publicCharacter(character: ReturnType<MemoryStore["createCharacter"]>) {
  const { agentToken: _, lastSafeCheckpoint: __, planNotes: ___, director: ____, agentVoice: _____, ...publicState } = character;
  return { ...publicState, ...(character.director?.shareSummaries && character.agentVoice ? { agentVoice: character.agentVoice } : {}) };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") await app.listen({ port, host: "0.0.0.0" });

export { app, store, clock, sim, persistence };
