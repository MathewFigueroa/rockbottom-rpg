import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { loadPacks } from "./packs.js";
import { GameClock, MemoryStore } from "./store.js";
import { storyView } from "./story.js";
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
const adminSessions = new Set<string>();

await app.register(cors, { origin: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174").split(","), credentials: true });
await app.register(cookie, { secret: process.env.ADMIN_SESSION_SECRET ?? "dev-only-secret-change-this-32-chars" });
await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
await app.register(websocket);

const operations = new WeakMap<import("fastify").FastifyRequest, { release: () => void; before: ReturnType<MemoryStore["snapshot"]> }>();
app.addHook("preHandler", async (request, reply) => {
  if (request.url.startsWith('/ws/') || request.url === '/health') return;
  const release = await persistence.acquire();
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
  if (/^\/api\/crews\/[^/]+\/ally$/.test(path)) return reply.code(409).send({ error: "mutual_alliance_consent_not_implemented" });
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
  const body = request.body as { name?: string; sex?: "male" | "female"; childName?: string; childAge?: number };
  if (!body || !["male", "female"].includes(body.sex ?? "") || typeof body.name !== "string" || typeof body.childName !== "string" || !Number.isFinite(body.childAge ?? 8)) return reply.code(400).send({ error: "name, sex, childName, and childAge are required" });
  const character = store.createCharacter({ name: body.name, sex: body.sex!, childName: body.childName, childAge: body.childAge ?? 8 });
  character.nextDecisionAt = clock.now();
  grantOwner(character.id, reply);
  return reply.code(201).send(character);
});

app.get<{ Params: { id: string } }>("/api/characters/:id", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  return character ? character : reply.code(404).send({ error: "character_not_found" });
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
  return reply.code(202).send({ ready: false, retry_at: character.nextDecisionAt });
});

app.get("/api/agent/story", async (request, reply) => {
  const character = agentCharacter(request.headers.authorization, request.headers["x-agent-token"] as string | undefined);
  if (!character) return reply.code(401).send({ error: "invalid_agent_token" });
  return { narrative: storyView(character), act: character.act, quest_step: character.questStep, objective: character.activeObjective, custody: sim.hearing(character), tapes: character.tapes.length };
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
  const body = request.body as { channel?: string; message?: string };
  const entry = { id: randomUUID(), characterId: character.id, channel: body.channel?.slice(0, 20) || "proximity", message: body.message?.slice(0, 280) || "", at: clock.now() };
  store.chat.push(entry);
  return entry;
});

app.get<{ Params: { id: string } }>("/api/watch/:id", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  return { character: publicCharacter(character), actions: character.actionLog, planNotes: [], spectatorCount: character.spectatorCount };
});

app.post<{ Params: { id: string; tapeId: string } }>("/api/characters/:id/tapes/:tapeId", async (request, reply) => {
  const character = store.characters.get(request.params.id);
  if (!character) return reply.code(404).send({ error: "character_not_found" });
  const allTapes = packs.flatMap((pack) => Array.isArray(pack.content.tapes) ? pack.content.tapes as Array<{ id?: string }> : []);
  if (!allTapes.some((tape) => tape.id === request.params.tapeId)) return reply.code(404).send({ error: "tape_not_found" });
  if (!character.tapes.includes(request.params.tapeId)) character.tapes.push(request.params.tapeId);
  return { collected: character.tapes.length, complete: character.tapes.length === allTapes.length, tapeId: request.params.tapeId };
});

app.get<{ Params: { id: string } }>("/ws/watch/:id", { websocket: true }, (socket, request) => {
  const character = store.characters.get(request.params.id);
  if (!character) return socket.close(1008, "character_not_found");
  character.spectatorCount += 1;
  const send = () => {
    if (persistence.busy || !persistence.healthy || repository?.healthy === false) return;
    const current = store.characters.get(request.params.id);
    if (current && socket.readyState === 1) socket.send(JSON.stringify({ character: publicCharacter(current), actions: current.actionLog, planNotes: [], spectatorCount: current.spectatorCount }));
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
  if (!crew.allies.includes(other.id)) crew.allies.push(other.id);
  if (!other.allies.includes(crew.id)) other.allies.push(crew.id);
  return { crew, other, mutual: true };
});

app.post("/api/chat", async (request, reply) => {
  const body = request.body as { characterId?: string; channel?: string; message?: string };
  if (!body.characterId || !store.characters.has(body.characterId)) return reply.code(404).send({ error: "character_not_found" });
  const entry = { id: randomUUID(), characterId: body.characterId, channel: body.channel ?? "proximity", message: String(body.message ?? "").slice(0, 280), at: clock.now() };
  store.chat.push(entry);
  return reply.code(201).send(entry);
});
app.get("/api/chat", async () => store.chat.slice(-50));

app.post("/api/reports", async (request, reply) => {
  const body = request.body as { reporterId?: string; targetId?: string; reason?: string; fingerprint?: string };
  if (!body.reporterId || !body.targetId || !store.characters.has(body.targetId)) return reply.code(400).send({ error: "invalid_report" });
  const previous = store.moderationCases.filter((item) => item.targetId === body.targetId && item.status !== "overturned").length;
  const flagNumber = Math.min(3, previous + 1);
  const penalty = flagNumber === 1 ? "1 hour communications ban" : flagNumber === 2 ? "24 hour game ban" : "permanent account, IP, and device-fingerprint ban";
  // Browsers cannot expose a MAC address. A salted device fingerprint hash is the industry substitute.
  const fingerprintHash = createHash("sha256").update(`${body.fingerprint ?? "unknown"}:${process.env.ADMIN_SESSION_SECRET ?? "dev"}`).digest("hex");
  const moderationCase = { id: randomUUID(), reporterId: body.reporterId, targetId: body.targetId, reason: String(body.reason ?? "unspecified").slice(0, 500), evidence: { audioClip: "data:audio/wav;base64,UklGRg==", chat: store.chat.filter((entry) => entry.characterId === body.targetId).slice(-10).map((entry) => entry.message), fingerprintHash }, status: "pending" as const, flagNumber, penalty: "No penalty pending review", appealNotes: "", createdAt: clock.now() };
  store.moderationCases.push(moderationCase);

  return reply.code(201).send(moderationCase);
});

app.post("/api/admin/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
  const body = request.body as { username?: string; password?: string };
  const expectedUser = process.env.ADMIN_USER ?? "warden";
  const expectedPass = process.env.ADMIN_PASSWORD ?? "change-me-now";
  if (!safeEqual(body.username ?? "", expectedUser) || !safeEqual(body.password ?? "", expectedPass)) return reply.code(401).send({ error: "invalid_credentials" });
  const session = randomBytes(24).toString("base64url");
  adminSessions.add(session);
  reply.setCookie("rb_admin", session, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 28_800 });
  return { ok: true };
});

app.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/api/admin/") || request.url === "/api/admin/login") return;
  const testSecret = request.headers["x-admin-secret"];
  const valid = adminSessions.has(request.cookies.rb_admin ?? "") || (process.env.NODE_ENV !== "production" && testSecret === "dev-admin");
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
  if (moderationCase.status !== "pending") return reply.code(409).send({ error: "case_already_decided" });
  moderationCase.status = body.decision!;
  moderationCase.appealNotes = body.appealNotes?.slice(0, 1000) ?? "";
  if (body.decision === "upheld") {
    const strikes = store.moderationCases.filter(c => c.targetId === moderationCase.targetId && c.status === "upheld").length;
    moderationCase.flagNumber = strikes;
    moderationCase.penalty = strikes === 1 ? "communications" : "game";
    store.bans.set(moderationCase.targetId, { kind: moderationCase.penalty, until: strikes >= 3 ? null : new Date(Date.now() + (strikes === 1 ? 3600000 : 86400000)).toISOString() });
  }
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
  const { agentToken: _, lastSafeCheckpoint: __, planNotes: ___, ...publicState } = character;
  return publicState;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") await app.listen({ port, host: "0.0.0.0" });

export { app, store, clock, sim };
