import { expect, it } from 'vitest';
import { MemoryStore, GameClock } from './store.js';
import { streetAction, streetState, streetView, settleStreet, addEvidence } from './streets.js';
import { Simulation } from './simulation.js';
function setup() {
  const store = new MemoryStore(); const clock = new GameClock(); clock.update({ paused: true });
  const c = store.createCharacter({ name: 'Jamie', sex: 'female', childName: 'Riley', childAge: 8 }); c.act = 2; c.cash = 500; c.story = { version: 1, stage: 2, path: 'street', choice: null, events: [] }; c.nextDecisionAt = clock.now();
  return { c, store, clock, sim: new Simulation(store, clock), act: (p: Record<string, unknown>) => streetAction(c, store, p, clock.nowMs(), 'fixed-seed') };
}
it('uses shared prices/stock, rejects invented ownership, and cannot sell the photograph', () => {
  const { c, store, act, clock } = setup(); const offered = streetView(c, store, clock.nowMs()).commands.find(x => x.params.sku === 'radio')!;
  const cash = c.cash; expect(act({ op: 'buy', sku: 'radio', price: 0 }).ok).toBe(true);
  expect(c.cash).toBeLessThan(cash); expect(store.market.offers.radio?.stock).toBe(2);
  const before = c.cash; expect(act({ op: 'sell', item: 'creased-photo', disclose: true }).ok).toBe(false); expect(c.cash).toBe(before);
  const second = store.createCharacter({ name: 'Bex', sex: 'female', childName: 'Riley', childAge: 8 }); second.act = 2; second.story = c.story; second.cash = 500;
  expect(streetAction(second, store, { op: 'sell', item: c.street!.items[0]!.id, disclose: true }, clock.nowMs(), 'x').ok).toBe(false);
  expect(offered.label).toContain('$');
});
it('inspects, repairs and sells an owned lot once, preserving shared stock on reload', () => {
  const { c, store, clock, act } = setup(); act({ op: 'buy', sku: 'radio' }); const item = c.street!.items[0]!;
  expect(act({ op: 'sell', item: item.id, disclose: true }).ok).toBe(false); act({ op: 'inspect', item: item.id });
  if (item.defective) expect(act({ op: 'repair', item: item.id }).ok).toBe(true);
  expect(act({ op: 'sell', item: item.id, disclose: true }).ok).toBe(true); const cash = c.cash;
  expect(act({ op: 'sell', item: item.id, disclose: true }).ok).toBe(false); expect(c.cash).toBe(cash);
  const restored = new MemoryStore(); restored.restore(store.snapshot()); expect(restored.market).toEqual(store.market);
  expect(streetView(c, store, clock.nowMs()).commands.length).toBeGreaterThan(0);
});
it('pays a scheduled courier route once and does not mint pay at departure', () => {
  const { c, act, clock } = setup(); const cash = c.cash; expect(act({ op: 'courier', opened: false }).ok).toBe(true); expect(c.cash).toBe(cash);
  const due = Date.parse(c.street!.courier!.due); expect(settleStreet(c, due - 1)).toBe(0); expect(settleStreet(c, due)).toBe(40); expect(settleStreet(c, due)).toBe(0);
  expect(act({ op: 'courier', opened: false }).ok).toBe(false);
  clock.update({ gameTime: new Date(clock.nowMs() + 86400000).toISOString() }); expect(act({ op: 'courier', opened: true }).ok).toBe(true);
});
it('does not criminalize poverty or HEAT without evidence', () => {
  const { c, act, clock } = setup(); c.cash = 0; c.heat = 100; settleStreet(c, clock.nowMs()); expect(c.street?.legal).toBeUndefined();
  expect(act({ op: 'police-contact' }).ok).toBe(false); expect(c.record).toBe(0);
});
it('distinguishes summons, bail, hearing and conviction, refunds escrow once and allows record repair', () => {
  const { c, act, clock } = setup(); addEvidence(c, 'fencing', clock.now(), 'bracelet');
  expect(act({ op: 'police-contact' }).ok).toBe(true); expect(c.record).toBe(0); const cash = c.cash;
  expect(act({ op: 'bail' }).ok).toBe(true); expect(c.cash).toBe(cash - 180); const due = Date.parse(c.street!.legal!.hearingAt!);
  settleStreet(c, due); expect(c.record).toBe(1); expect(c.cash).toBe(cash - 20); settleStreet(c, due); expect(c.cash).toBe(cash - 20);
  for (let i = 0; i < 3; i++) expect(act({ op: 'community-work' }).ok).toBe(true);
  expect(c.record).toBe(0); expect(act({ op: 'community-work' }).ok).toBe(false);
});
it('enforces jail restrictions, supports public defense and restitution, then releases at the hearing', () => {
  const { c, act, clock, sim } = setup(); addEvidence(c, 'fraud', clock.now(), 'radio'); act({ op: 'police-contact' }); act({ op: 'defender' });
  expect(sim.act(c, 'day_labor').ok).toBe(false); expect(act({ op: 'call-dana' }).ok).toBe(true); expect(act({ op: 'restitution' }).ok).toBe(true);
  const legal = streetState(c).legal!; settleStreet(c, Date.parse(legal.hearingAt!));
  expect(legal.outcome).toBe('diversion'); expect(c.record).toBe(0); expect(c.street?.legal?.status).toBe('closed');
});
