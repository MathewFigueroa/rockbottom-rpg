import { expect, it } from 'vitest';
import { MemoryStore, GameClock } from './store.js';
import { Simulation } from './simulation.js';
import { armyAction, armyView, settleArmy } from './army.js';
const DAY = 86400000;
function setup() {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter({ name: 'Jamie', sex: 'female', childName: 'Riley', childAge: 8 });
  c.act = 2; c.story = { version: 1, stage: 2, path: 'army', choice: null, events: [] }; c.nextDecisionAt = clock.now();
  return { store, clock, c, sim: new Simulation(store, clock) };
}
const answers = [0, 2, 1, 1, 2, 0, 0, 1, 2, 2, 0, 1];
function train() {
  const ctx = setup(); const { c, clock, sim } = ctx;
  expect(sim.act(c, 'army_action', { op: 'enroll' }).ok).toBe(true);
  for (const answer of answers) expect(sim.act(c, 'army_action', { op: 'answer', answer }).ok).toBe(true);
  for (let day = 0; day < 3; day++) {
    expect(sim.act(c, 'army_action', { op: 'start-drill' }).ok).toBe(true);
    for (const input of ['left', 'action', 'right', 'action', 'hold']) expect(sim.act(c, 'army_action', { op: 'input', input }).ok).toBe(true);
    clock.update({ gameTime: c.nextDecisionAt }); sim.tick();
  }
  return ctx;
}
it('executes twelve timed answers and three separate training days without accepting self-reported scores', () => {
  const { c, sim } = train(); expect(c.army?.rank).toBe('E-4'); expect(c.army?.trainingDays).toBe(3); expect(c.army?.phase).toBe('active');
  expect(sim.act(c, 'army_action', { op: 'answer', answer: 0, correct: 12 }).ok).toBe(false);
});
it('enforces assessment and drill deadlines, and rejects invalid inputs without advancement', () => {
  const { c, clock } = setup(); armyAction(c, { op: 'enroll' }, clock.nowMs());
  expect(armyAction(c, { op: 'answer', answer: 99 }, clock.nowMs()).ok).toBe(false); expect(c.army?.assessment.index).toBe(0);
  clock.update({ gameTime: new Date(clock.nowMs() + 180001).toISOString() }); armyAction(c, { op: 'finish-assessment' }, clock.nowMs());
  expect(c.army?.rank).toBe('E-1'); armyAction(c, { op: 'start-drill' }, clock.nowMs());
  armyAction(c, { op: 'input', input: 'left' }, clock.nowMs() + 18001); expect(c.army?.trainingDays).toBe(0); expect(c.army?.drill).toBeUndefined();
});
it('pays weekly once, separates support, stops at the term boundary and discharges with a voucher', () => {
  const { c, clock, sim, store } = train(); const a = c.army!;
  armyAction(c, { op: 'allotment', percent: 28 }, clock.nowMs());
  clock.update({ gameTime: a.nextPay! }); sim.tick(); const firstCash = c.cash;
  expect(a.paychecks).toBe(1); expect(a.supportPaid).toBe(Math.floor(640 * .28)); sim.tick(); expect(c.cash).toBe(firstCash);
  expect(armyAction(c, { op: 'allotment', percent: 10 }, clock.nowMs()).ok).toBe(false);
  clock.update({ gameTime: a.termEnd! }); sim.tick(); expect(a.paychecks).toBe(8); expect(a.phase).toBe('terminal-leave');
  const restored = new MemoryStore(); restored.restore(store.snapshot()); expect(restored.characters.get(c.id)?.army).toEqual(a);
  expect(armyAction(c, { op: 'discharge' }, clock.nowMs()).ok).toBe(true); expect(c.housing).toBe('sro');
  const cash = c.cash; settleArmy(c, clock.nowMs() + 100 * DAY, 'seed'); expect(c.cash).toBe(cash);
});
it('requires current-offer consent, schedules the outcome, and resolves once without client seeds or odds', () => {
  const { c, clock, sim, store } = train(); clock.update({ gameTime: c.army!.nextOffer! }); sim.tick();
  const offer = c.army!.offer!; const before = structuredClone(c.army);
  expect(armyAction(c, { op: 'deploy', offer: offer.id, withSquad: true, tactic: 'cover' }, clock.nowMs()).ok).toBe(false); expect(c.army).toEqual(before);
  expect(armyAction(c, { op: 'deploy', offer: offer.id, withSquad: true, tactic: 'cover', confirmPermanentDeath: true, risk: 0 }, clock.nowMs()).ok).toBe(true);
  expect(c.army?.history).toHaveLength(0); const due = c.army!.deployed!.due;
  expect(sim.act(c, 'day_labor').ok).toBe(false);
  settleArmy(c, Date.parse(due), store.runtime(c.id).randomSeed!); expect(c.army?.history).toHaveLength(1);
  const cash = c.cash; settleArmy(c, Date.parse(due), store.runtime(c.id).randomSeed!); expect(c.cash).toBe(cash);
  expect(armyView(c, Date.parse(due)).commands.some(x => x.params.op === 'deploy')).toBe(false);
});
it('re-enlists without replaying a completed term’s payments', () => {
  const { c, clock, sim } = train(); clock.update({ gameTime: c.army!.termEnd! }); sim.tick(); const cash = c.cash;
  armyAction(c, { op: 'reup' }, clock.nowMs()); expect(c.army?.term).toBe(2); expect(c.army?.paychecks).toBe(0); sim.tick(); expect(c.cash).toBe(cash);
});
it('checkpoint recovery preserves paid wages and completed progress', () => {
  const { c, store, clock, sim } = train(); c.cash = 400; c.lastSafeCheckpoint = { cash: 4, location: 'Mercy House Shelter' }; c.status = 'stuck';
  store.runtime(c.id).stuckSince = clock.nowMs() - 31 * 60000; sim.tick(); expect(c.cash).toBe(400); expect(c.army?.trainingDays).toBe(3);
});
it('preserves usable timed windows on an accelerated shard', () => {
  const { c, clock, sim } = setup(); clock.update({ scale: 60, paused: true });
  sim.act(c, 'army_action', { op: 'enroll' }); expect(Date.parse(c.army!.assessment.deadline) - clock.nowMs()).toBe(180000 * 60);
});
