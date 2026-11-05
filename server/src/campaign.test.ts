import { expect, it } from 'vitest';
import { CAMPAIGN_QUESTS, type CharacterState } from '@rockbottom/shared';
import { advanceQuest, campaignState, campaignView, casualtyRoll, completed } from './campaign.js';
import { advanceStory, choices } from './story.js';
import { GameClock, MemoryStore } from './store.js';
import { Simulation } from './simulation.js';

function setup(path: 'army' | 'street') {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter({ name: 'Morgan', sex: 'female', childName: 'Casey', childAge: 8 });
  c.act = 2; c.cash = 650; c.incomeConsistency = 80; c.visitationAttendance = 100; c.sobrietyDays = 90; c.housing = 'shelter';
  c.nextDecisionAt = clock.now(); advanceStory(c, 'open_record'); advanceStory(c, path);
  return { c, store, clock, sim: new Simulation(store, clock) };
}
function quest(c: CharacterState, id: string, decisions: string[]) {
  for (const choice of decisions) {
    const result = advanceQuest(c, { quest: id, choice }, new Date().toISOString(), () => 'test');
    expect(result.ok, result.message).toBe(true);
  }
}
function unlockArmy(c: CharacterState) { quest(c, 'the-score', ['review', '30', 'rebalance', 'source']); quest(c, 'first-rotation', ['together', '28']); }
it('gates the ledger behind actual path quests and never grants rewards twice', () => {
  const { c } = setup('street'); expect(choices(c)).toEqual([]);
  expect(advanceStory(c, 'verify_copy').ok).toBe(false);
  expect(advanceQuest(c, { quest: 'the-flip', choice: 'inspect' }, '', () => '').ok).toBe(false);
  quest(c, 'regulars', ['play', 'return-wallet', 'courier']); quest(c, 'the-flip', ['inspect', 'disclose', 'return']);
  expect(choices(c)).toEqual(['verify_copy']);
  const cash = c.cash;
  expect(advanceQuest(c, { quest: 'the-flip', choice: 'return' }, '', () => '').ok).toBe(false); expect(c.cash).toBe(cash);
  expect(c.campaign?.trust.sam).toBeGreaterThan(0); expect(c.campaign?.flags).toContain('heirloom-returned');
});
it('rejects unaffordable housing atomically, then sustains sobriety in an earned home', () => {
  const { c, store, sim, clock } = setup('street'); quest(c, 'regulars', ['play', 'keep-wallet', 'courier']); quest(c, 'the-flip', ['inspect', 'hide', 'fence']);
  c.cash = 179; const before = structuredClone(c);
  expect(advanceQuest(c, { quest: 'keys', choice: 'sro' }, '', () => '').ok).toBe(false); expect(c).toEqual(before);
  c.cash = 580; quest(c, 'keys', ['sro', 'two-bedroom']); expect(c.cash).toBe(0); expect(c.housing).toBe('two-bedroom');
  expect(sim.act(c, 'sleep_shelter').ok).toBe(true); expect(c.sobrietyDays).toBe(91);
  clock.update({ gameTime: c.nextDecisionAt }); expect(store.characters.get(c.id)?.housing).toBe('two-bedroom');
});
for (const fatal of [true, false]) it(`requires explicit fatal-risk consent and fixes the seeded outcome: fatal=${fatal}`, () => {
  const { c, store, sim } = setup('army'); unlockArmy(c);
  const before = structuredClone(c);
  expect(advanceQuest(c, { quest: 'first-rotation', choice: 'ridge' }, '', () => 'ignored').ok).toBe(false); expect(c).toEqual(before);
  let seed = '';
  for (let i = 0; i < 10000; i++) if ((casualtyRoll(String(i), c.id) < 0.02) === fatal) { seed = String(i); break; }
  store.runtime(c.id).randomSeed = seed;
  const gross = 160 * 3; const support = Math.floor(gross * .28); const cash = c.cash;
  const result = sim.act(c, 'quest_choice', { quest: 'first-rotation', choice: 'ridge', confirmPermanentDeath: true, risk: 0, seed: 'client-forgery' });
  expect(result.ok).toBe(true); expect(c.cash - cash).toBe(gross - support); expect(c.campaign?.supportPaid).toBe(support);
  expect(c.campaign?.events.at(-1)?.roll).toBe(casualtyRoll(seed, c.id)); expect(c.status === 'dead').toBe(fatal);
  const restored = new MemoryStore(); restored.restore(store.snapshot());
  expect(restored.runtime(c.id).randomSeed).toBe(seed);
  expect(advanceQuest(c, { quest: 'first-rotation', choice: 'ridge', confirmPermanentDeath: true }, '', () => 'reroll').ok).toBe(false);
  if (fatal) {
    expect(sim.act(c, 'safe_idle').ok).toBe(false);
    quest(c, 'the-frame', ['open-box', 'mark-uncertain', 'call-home']);
    expect(c.status).toBe('dead'); expect(c.campaign?.ending).toBe('HONOR'); expect(c.campaign?.perspective).toBe('adult-child');
  }
});
for (const path of ['army', 'street'] as const) for (const visit of ['return_tuesday', 'follow_audit']) it(`plays ${path} through the inquiry, real court order and reflective frame (${visit})`, () => {
  const { c, sim, clock } = setup(path);
  c.mode = 'agent';
  const act = (questId: string, choice: string) => {
    const result = sim.act(c, 'quest_choice', { quest: questId, choice }, true); expect(result.ok, result.message).toBe(true);
    clock.update({ gameTime: c.nextDecisionAt });
  };
  if (path === 'street') { for (const choice of ['play', 'return-wallet', 'courier']) act('regulars', choice); for (const choice of ['inspect', 'disclose', 'return']) act('the-flip', choice); }
  else { for (const choice of ['review', '30', 'rebalance', 'source']) act('the-score', choice); for (const choice of ['together', '28', 'decline', 'complete-record']) act('first-rotation', choice); }
  for (const choice of ['verify_copy', 'save_neighbors', 'challenge_dana', 'protect_witnesses', visit, 'release_record']) {
    const result = sim.act(c, 'story_decision', { choice }, true); expect(result.ok, result.message).toBe(true); clock.update({ gameTime: c.nextDecisionAt });
  }
  act('keys', 'sro'); act('keys', 'two-bedroom');
  act('day-thirty', 'honest'); act('day-thirty', 'hear-order');
  expect(c.campaign?.flags).toContain(`custody-order:${sim.hearing(c).level}`);
  act('the-frame', 'open-box'); act('the-frame', 'documentary'); act('the-frame', 'close-box');
  expect(sim.act(c, 'day_labor').ok).toBe(false);
  expect(c.campaign?.ending).toBe('FORGIVENESS'); expect(completed(c, 'the-frame')).toBe(true);
  expect(campaignView(c).quests).toEqual([]); expect(c.campaign?.events.at(-2)?.text).toContain(path === 'street' ? 'bracelet' : 'refusal');
  expect(c.visitationAttendance).toBe(visit === 'follow_audit' ? 80 : 100);
});
it('migrates legacy six-scene story saves without resetting choices or rewards', () => {
  const { c } = setup('street'); c.story!.stage = 6; c.story!.choice = 'secure_ledger';
  const before = c.story!.events.slice();
  expect(choices(c)).toEqual(['return_tuesday', 'follow_audit']); advanceStory(c, 'return_tuesday');
  expect(c.story!.events.slice(0, before.length)).toEqual(before); expect(c.story!.choice).toBe('secure_ledger');
  expect(campaignState(c).version).toBe(1);
});
it('keeps every quest option and stage identifier unique and every effect bounded', () => {
  expect(new Set(CAMPAIGN_QUESTS.map(q => q.id)).size).toBe(CAMPAIGN_QUESTS.length);
  for (const q of CAMPAIGN_QUESTS) {
    expect(new Set(q.stages.map(s => s.id)).size).toBe(q.stages.length);
    for (const stage of q.stages) { expect(new Set(stage.options.map(o => o.id)).size).toBe(stage.options.length); for (const option of stage.options) expect(option.lethalRisk ?? 0).toBeLessThanOrEqual(1); }
  }
});
