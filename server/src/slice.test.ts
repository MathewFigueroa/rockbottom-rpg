import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, GameClock } from './store.js';
import { Simulation } from './simulation.js';
import { advanceQuest } from './campaign.js';
import { advanceStory, choices } from './story.js';
import { app, store } from './index.js';
afterAll(() => app.close());
const input = { name: 'Alex', sex: 'female' as const, childName: 'Riley', childAge: 8 };
it('persists and restores private ownership, progress, runtime and moderation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-'));
  try {
    const a = new MemoryStore(join(dir, 'save.json')); const c = a.createCharacter(input);
    a.clockState = new GameClock().update({ scale: 30, paused: true });
    a.owners.set(c.id, 'hash'); c.act = 2; advanceStory(c, 'open_record'); a.save();
    const b = new MemoryStore(join(dir, 'save.json'));
    expect(b.characters.get(c.id)?.story?.stage).toBe(1); expect(b.owners.get(c.id)).toBe('hash'); expect(b.runtime(c.id)).toBeTruthy(); expect(b.clockState?.paused).toBe(true); expect(b.clockState?.scale).toBe(30);
  } finally { rmSync(dir, { recursive: true }); }
});
for (const path of ['street', 'army']) for (const rescue of ['save_neighbors', 'secure_ledger']) for (const ending of ['publish_names', 'protect_witnesses']) it(`executes ${path}/${rescue}/${ending} once with consequences`, () => {
  const m = new MemoryStore(); const c = m.createCharacter(input);
  expect(advanceStory(c, 'open_record').ok).toBe(false); c.act = 2;
  for (const choice of ['open_record', path]) expect(advanceStory(c, choice).ok).toBe(true);
  const route = path === 'street' ? [['regulars', ['play', 'return-wallet', 'courier']], ['the-flip', ['inspect', 'disclose', 'return']]] : [['the-score', ['review', '30', 'rebalance', 'source']], ['first-rotation', ['together', '28', 'decline', 'complete-record']]];
  for (const [quest, decisions] of route) for (const choice of decisions!) expect(advanceQuest(c, { quest, choice }, new Date().toISOString(), () => 'test-seed').ok).toBe(true);
  for (const choice of ['verify_copy', rescue, 'hear_witnesses', ending, 'return_tuesday', 'release_record']) expect(advanceStory(c, choice).ok).toBe(true);
  expect(c.story?.events).toHaveLength(8); expect(c.story?.path).toBe(path); expect(choices(c)).toEqual([]); expect(c.act).toBe(3);
  expect(c.inventory.includes('verified-ledger')).toBe(rescue === 'secure_ledger');
  expect(advanceStory(c, ending).ok).toBe(false);
});
it('enforces time for manual and agent, and terminal death', () => {
  const m = new MemoryStore(); const c = m.createCharacter(input); const sim = new Simulation(m, new GameClock());
  expect(sim.act(c, 'collect_recycling').ok).toBe(true);
  expect(sim.act(c, 'collect_recycling').ok).toBe(false);
  c.nextDecisionAt = new Date(0).toISOString(); c.status = 'dead'; c.mode = 'agent'; c.actedWindow = c.decisionWindow; sim.tick(); expect(c.status).toBe('dead'); expect(sim.act(c, 'safe_idle').ok).toBe(false);
});
it('requires owner cookies, isolates agents and redacts spectator secrets', async () => {
  const created = await app.inject({ method: 'POST', url: '/api/characters', payload: input });
  const c = created.json(); const cookie = created.cookies.map(x => `${x.name}=${x.value}`).join('; ');
  expect((await app.inject({ url: `/api/characters/${c.id}` })).statusCode).toBe(401);
  expect((await app.inject({ url: `/api/characters/${c.id}`, headers: { cookie } })).statusCode).toBe(200);
  const watch = await app.inject({ url: `/api/watch/${c.id}` }); expect(watch.body).not.toContain(c.agentToken);
  const action = await app.inject({ method: 'POST', url: '/api/agent/act', headers: { authorization: `Bearer ${c.agentToken}` }, payload: { action: 'busk' } }); expect(action.body).not.toContain(c.agentToken);
  const other = store.createCharacter(input);
  const report = await app.inject({ method: 'POST', url: '/api/reports', headers: { cookie }, payload: { reporterId: c.id, targetId: other.id, reason: 'review' } });
  expect(report.statusCode).toBe(201); expect(store.bans.has(other.id)).toBe(false);
  expect((await app.inject({ method: 'POST', url: '/api/chat', headers: { cookie }, payload: { characterId: other.id, message: 'forged' } })).statusCode).toBe(401);
});
