import { expect, it } from 'vitest';
import { MemoryStore, GameClock } from './store.js';
import { Simulation } from './simulation.js';
import { socialView } from './social.js';

for (const priority of ['care', 'restless'] as const) it(`plays a fresh life to a distinct recorded ending (${priority})`, () => {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter({ name: priority, sex: 'female', childName: 'Riley', childAge: 8 }); c.mode = 'agent'; c.nextDecisionAt = clock.now();
  const sim = new Simulation(store, clock);
  const act = (action: string, params: Record<string, unknown> = {}, advance = true) => {
    const result = sim.act(c, action, params, true); expect(result.ok, `${action}: ${result.message}`).toBe(true);
    if (advance) { clock.update({ gameTime: c.nextDecisionAt }); sim.tick(); }
  };
  const earn = (cash: number) => { for (let guard = 0; c.cash < cash && guard < 50; guard++) { if (c.needs.energy < 15) act(c.housing === 'underpass' || c.housing === 'tent' ? 'safe_idle' : 'sleep_shelter'); else act('day_labor'); } expect(c.cash).toBeGreaterThanOrEqual(cash); };
  for (let i = 0; i < 3; i++) act('collect_recycling'); act('claim_shelter');
  while (c.shiftsWorked < 4) { if (c.needs.energy < 15) act('sleep_shelter'); else act('day_labor'); }
  while (c.shelterDays < 7) act('sleep_shelter'); act('attend_visitation');
  for (const choice of ['open_record', 'street']) act('story_decision', { choice });
  for (const choice of ['play', priority === 'care' ? 'return-wallet' : 'keep-wallet', 'courier']) act('quest_choice', { quest: 'regulars', choice });
  for (const choice of ['inspect', priority === 'care' ? 'disclose' : 'hide', priority === 'care' ? 'return' : 'fence']) act('quest_choice', { quest: 'the-flip', choice });
  for (const choice of ['verify_copy', priority === 'care' ? 'save_neighbors' : 'secure_ledger', 'challenge_dana', priority === 'care' ? 'protect_witnesses' : 'publish_names', priority === 'care' ? 'return_tuesday' : 'follow_audit', 'release_record']) act('story_decision', { choice });
  if (c.street?.evidence.some(e => !e.resolved)) {
    earn(115); if (!c.street.legal || c.street.legal.status === 'closed') act('street_action', { op: 'police-contact' });
    act('street_action', { op: 'defender' }, false); act('street_action', { op: 'call-dana' }, false); act('street_action', { op: 'restitution' }, false);
    clock.update({ gameTime: c.street.legal!.hearingAt! }); sim.tick(); expect(c.street.legal!.outcome).toBe('diversion');
  }
  // Optional arcs are chosen by the private seed, then played according to the policy's priorities.
  for (let count = 0; count < 4; count++) {
    if (count) { clock.update({ gameTime: new Date(clock.nowMs() + 7 * 3600000).toISOString() }); sim.tick(); }
    act('life_action', { op: 'seek' });
    while (c.social?.encounter) {
      const e = c.social.encounter;
      const choices = e.arc === 'old-friends' ? [priority === 'care' ? 'support' : 'roof', priority === 'care' ? 'truth' : 'conceal', 'boundary'] : e.arc === 'crew-up' ? ['join', 'keep', priority === 'care' ? 'confront' : 'report'] : e.arc === 'sam-repair' ? ['space', 'own', 'annotate'] : ['household', 'private', 'whole'];
      expect(socialView(c, store, clock.nowMs()).commands.some(command => command.params.choice === choices[e.step])).toBe(true);
      act('life_action', { op: 'encounter', choice: choices[e.step] });
    }
  }
  if (c.housing === 'underpass') { earn(50); act('claim_shelter'); }
  earn(priority === 'care' ? 580 : 180); act('quest_choice', { quest: 'keys', choice: 'sro' });
  act('quest_choice', { quest: 'keys', choice: priority === 'care' ? 'two-bedroom' : 'prepare' });
  for (const choice of ['honest', 'hear-order']) act('quest_choice', { quest: 'day-thirty', choice });
  for (const choice of ['open-box', 'mark-uncertain', 'call-home']) act('quest_choice', { quest: 'the-frame', choice });
  expect(c.campaign?.ending).toBe(priority === 'care' ? 'FORGIVENESS' : 'THE CYCLE');
  expect(c.tapes).toHaveLength(24); expect(c.social?.completed).toHaveLength(4); expect(c.chronicle!.length).toBeGreaterThan(20);
  expect(sim.act(c, 'day_labor').ok).toBe(false);
  const restored = new MemoryStore(); restored.restore(store.snapshot()); expect(restored.characters.get(c.id)?.campaign?.ending).toBe(c.campaign?.ending);
});
