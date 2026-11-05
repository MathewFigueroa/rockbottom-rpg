import { expect, it } from 'vitest';
import { MemoryStore, GameClock } from './store.js';
import { Simulation } from './simulation.js';
import { decisionContext } from './decisions.js';
const input = { name: 'Jamie', sex: 'female' as const, childName: 'Riley', childAge: 8 };
it('turns an over-slept, hungry recycling loop into needs recovery, counted shifts and the actual visit', () => {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter(input); c.nextDecisionAt = clock.now(); c.housing = 'shelter'; c.cash = 310; c.questStep = 2; c.shelterDays = 135; c.needs.energy = 100; c.needs.hunger = 20;
  const sim = new Simulation(store, clock);
  let menu = decisionContext(c, store, clock.nowMs());
  expect(menu.actions.map(a => a.action)).toContain('eat_diner');
  expect(menu.actions.map(a => a.action)).not.toContain('sleep_shelter');
  expect(menu.actions.map(a => a.action)).not.toContain('collect_recycling');
  function act(action: string) {
    expect(decisionContext(c, store, clock.nowMs()).actions.some(a => a.action === action)).toBe(true);
    const result = sim.act(c, action); expect(result.ok, result.message).toBe(true); clock.update({ gameTime: c.nextDecisionAt });
  }
  act('eat_diner');
  for (let i = 0; i < 4; i++) act('day_labor');
  expect(c.shiftsWorked).toBe(4); expect(c.shelterDays).toBe(135);
  expect(c.questStep).toBe(3); act('attend_visitation');
  expect(c.act).toBe(2);
  act('eat_diner');
  menu = decisionContext(c, store, clock.nowMs());
  expect(menu.actions).toContainEqual(expect.objectContaining({ action: 'story_decision', params: { choice: 'open_record' } }));
  expect(sim.act(c, 'story_decision', { choice: 'open_record' }).ok).toBe(true);
  const paths = decisionContext(c, store, clock.nowMs()).actions.filter(a => a.action === 'story_decision');
  expect(paths.map(a => a.params.choice)).toEqual(['street', 'army']);
});
it('exhaustion offers recovery rather than a work shift, and full-health sleep is not an infinite milestone', () => {
  const store = new MemoryStore(); const c = store.createCharacter(input); c.housing = 'shelter'; c.questStep = 2; c.shelterDays = 7; c.needs.energy = 0;
  expect(decisionContext(c, store, Date.now()).actions.map(a => a.action)).toContain('sleep_shelter');
  expect(decisionContext(c, store, Date.now()).actions.map(a => a.action)).not.toContain('day_labor');
  c.needs.energy = 100;
  expect(decisionContext(c, store, Date.now()).actions.map(a => a.action)).not.toContain('sleep_shelter');
});
it('keeps assessment and drill inputs in the menu while counting each input as progress', () => {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter(input); c.nextDecisionAt = clock.now(); c.act = 2; c.story = { version: 1, stage: 2, path: 'army', choice: null, events: [] };
  const sim = new Simulation(store, clock);
  expect(sim.act(c, 'army_action', { op: 'enroll' }).ok).toBe(true);
  const before = decisionContext(c, store, clock.nowMs());
  const answer = before.actions.find(a => a.action === 'army_action' && a.params.op === 'answer')!;
  expect(answer.category).toBe('progress');
  expect(sim.act(c, answer.action, answer.params).ok).toBe(true);
  expect(decisionContext(c, store, clock.nowMs()).milestones.armyAssessment).not.toBe(before.milestones.armyAssessment);
});
