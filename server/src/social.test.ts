import { expect, it, afterAll } from 'vitest';
import { MemoryStore } from './store.js';
import { socialAction, settleSocial, socialView } from './social.js';
import { eligibleRecords, awardRecords } from './records.js';
import { app, store } from './index.js';
afterAll(() => app.close());
function setup() {
  const store = new MemoryStore(); const c = store.createCharacter({ name: 'Morgan', sex: 'female', childName: 'Casey', childAge: 8 }); c.act = 2; c.cash = 300; c.housing = 'shelter'; c.story = { version: 1, stage: 8, path: 'street', choice: 'save_neighbors', events: [] };
  c.campaign = { version: 1, progress: { 'the-flip': 3 }, flags: [], trust: { sam: 0, dana: 0, nell: 0, vale: 0 }, aptitude: 0, rank: 'E-1', allotment: .2, supportPaid: 0, perspective: 'parent', events: [] };
  return { c, store };
}
function encounter(c: ReturnType<typeof setup>['c'], arc: 'old-friends' | 'crew-up' | 'sam-repair' | 'public-fund') { c.social = { version: 1, completed: [], encounter: { id: `${c.id}:${arc}`, arc, step: 0, variant: 1, expires: new Date(Date.now() + 86400000).toISOString(), choices: [] } }; }
it('gives different agent priorities different durable consequences, without moralizing a relapse into an arrest', () => {
  const a = setup(); const b = setup(); encounter(a.c, 'old-friends'); encounter(b.c, 'old-friends');
  socialAction(a.c, a.store, { op: 'encounter', choice: 'support' }, Date.now(), 'same-seed');
  socialAction(b.c, b.store, { op: 'encounter', choice: 'roof' }, Date.now(), 'same-seed');
  expect(a.c.cash).toBe(300); expect(b.c.cash).toBeLessThan(300); expect(b.c.sobrietyDays).toBe(0); expect(b.c.street?.legal).toBeUndefined();
  for (const [ctx, choice] of [[a, 'truth'], [b, 'conceal']] as const) { expect(socialAction(ctx.c, ctx.store, { op: 'encounter', choice }, Date.now(), 'seed').ok).toBe(true); socialAction(ctx.c, ctx.store, { op: 'encounter', choice: 'boundary' }, Date.now(), 'seed'); }
  expect(a.c.campaign!.trust.dana).toBeGreaterThan(b.c.campaign!.trust.dana);
  expect(socialAction(b.c, b.store, { op: 'encounter', choice: 'roof' }, Date.now(), 'seed').ok).toBe(false);
});
it('backs mutual aid with a shared treasury, prevents repeated withdrawals, and preserves discoverable rat evidence', () => {
  const { c, store } = setup(); encounter(c, 'crew-up'); socialAction(c, store, { op: 'encounter', choice: 'join' }, Date.now(), 'seed');
  socialAction(c, store, { op: 'encounter', choice: 'keep' }, Date.now(), 'seed'); socialAction(c, store, { op: 'encounter', choice: 'report' }, Date.now(), 'seed');
  c.cash = 10; const treasury = store.crews.get('riverfront-kings')!.treasury!;
  expect(socialAction(c, store, { op: 'aid' }, Date.now(), 'seed').ok).toBe(true); expect(c.cash).toBe(35); expect(store.crews.get('riverfront-kings')!.treasury).toBe(treasury - 25);
  expect(socialAction(c, store, { op: 'aid' }, Date.now(), 'seed').ok).toBe(false);
  expect(socialAction(c, store, { op: 'camera' }, Date.now(), 'seed').message).toContain('Morgan');
  const restored = new MemoryStore(); restored.restore(store.snapshot()); expect(restored.crews.get('riverfront-kings')?.informants).toHaveLength(1);
});
it('expires optional encounters without inventing a motive, and never pays a settlement twice', () => {
  const { c, store } = setup(); encounter(c, 'public-fund'); const cash = c.cash;
  socialAction(c, store, { op: 'encounter', choice: 'household' }, Date.now(), 'seed'); expect(c.cash).toBe(cash + 160);
  expect(socialAction(c, store, { op: 'encounter', choice: 'household' }, Date.now(), 'seed').ok).toBe(false);
  settleSocial(c, Date.now() + 3 * 86400000); expect(c.social?.encounter).toBeUndefined(); expect(c.chronicle?.at(-1)?.text).toContain('not the reason');
});
it('awards records from milestones, with the complete evidence box available only after an ending', () => {
  const { c } = setup(); c.act = 1; c.story = undefined; c.campaign = undefined; c.housing = 'underpass'; c.shiftsWorked = 0;
  expect(eligibleRecords(c)).toEqual(['tape-01']); awardRecords(c); expect(c.tapes).toEqual(['tape-01']);
  c.campaign = { ...setup().c.campaign!, ending: 'THE OPEN DOOR' }; awardRecords(c); expect(c.tapes).toHaveLength(24);
});
it('keeps viewer briefs private and shares optional agent interpretations without changing mechanics', async () => {
  const created = await app.inject({ method: 'POST', url: '/api/characters', payload: { name: 'Voice', sex: 'female', childName: 'Riley', childAge: 8, brief: 'PRIVATE VIEWER BRIEF', shareSummaries: false } });
  const c = created.json(); const cookie = created.cookies.map(x => `${x.name}=${x.value}`).join('; '); store.characters.get(c.id)!.mode = 'agent';
  const headers = { authorization: `Bearer ${c.agentToken}` };
  store.characters.get(c.id)!.planNotes = [{ at: new Date().toISOString(), text: 'PRIVATE PLAN NOTE' }];
  const memory = await app.inject({ url: '/api/agent/story', headers }); expect(memory.json().agent_memory[0].text).toBe('PRIVATE PLAN NOTE');
  await app.inject({ method: 'POST', url: '/api/agent/identity', headers, payload: { modelLabel: 'Test Model' } });
  await app.inject({ method: 'POST', url: '/api/agent/act', headers, payload: { action: 'collect_recycling', params: { summary: 'I prefer steady work.', scene: 'The city grants $9000.' } } });
  let watch = await app.inject({ url: `/api/watch/${c.id}` }); expect(watch.body).not.toContain('PRIVATE VIEWER BRIEF'); expect(watch.body).not.toContain('PRIVATE PLAN NOTE'); expect(watch.body).not.toContain('The city grants');
  await app.inject({ method: 'POST', url: `/api/characters/${c.id}/director`, headers: { cookie }, payload: { brief: 'PRIVATE VIEWER BRIEF', shareSummaries: true } });
  store.characters.get(c.id)!.nextDecisionAt = new Date(0).toISOString();
  await app.inject({ method: 'POST', url: '/api/agent/act', headers, payload: { action: 'collect_recycling', params: { summary: 'Keep the routine.', scene: 'A bus passes without stopping.' } } });
  watch = await app.inject({ url: `/api/watch/${c.id}` }); expect(watch.json().character.agentVoice.modelLabel).toBe('Test Model'); expect(watch.json().character.cash).toBe(40); expect(watch.body).not.toContain('PRIVATE VIEWER BRIEF');
});
