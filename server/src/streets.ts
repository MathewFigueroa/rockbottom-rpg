import type { CharacterState, LifeCommand, LifeView, MarketState, StreetState } from '@rockbottom/shared';
import type { MemoryStore } from './store.js';
import { deny, done, draw, narrate, type SystemResult } from './narrative.js';
const DAY = 86400000;
const GOODS = { radio: { name: 'warm-running radio', cost: 18, repair: 8, resale: 42 }, lamp: { name: 'brass lamp', cost: 12, repair: 5, resale: 28 }, bracelet: { name: 'bracelet with disputed provenance', cost: 60, repair: 0, resale: 140 } };
function sku(value: unknown): value is keyof typeof GOODS { return typeof value === 'string' && value in GOODS; }
export function streetState(c: CharacterState): StreetState { return c.street ??= { version: 1, items: [], evidence: [], lastCourierDay: -1, communityDays: 0 }; }
function market(store: MemoryStore, now: number, apply = false): MarketState {
  const day = Math.floor(now / DAY);
  if (store.market.day >= day) return store.market;
  const next: MarketState = { day, serial: store.market.serial, offers: {} };
  for (const [key, value] of Object.entries(GOODS)) next.offers[key] = { price: value.cost + Math.floor(draw('halvern-market', `${day}:${key}`) * 5), stock: key === 'bracelet' ? 1 : 3 };
  if (apply) store.market = next;
  return next;
}
export function addEvidence(c: CharacterState, kind: 'fencing' | 'fraud', at: string, id: string) {
  const s = streetState(c); if (s.evidence.some(e => e.id === id)) return;
  s.evidence.push({ id, kind, at, resolved: false, restitution: false });
}
const eligible = (c: CharacterState) => c.act >= 2 && (c.story?.path === 'street' || c.army?.phase === 'discharged') && c.status !== 'dead' && c.campaign?.perspective !== 'adult-child';
export function streetView(c: CharacterState, store: MemoryStore, now: number): LifeView {
  const commands: LifeCommand[] = []; const s = c.street;
  const add = (op: string, label: string, params: Record<string, string | number | boolean> = {}, blocked?: string) => commands.push({ action: 'street_action', label, params: { op, ...params }, blocked });
  if (!eligible(c)) return { title: 'Market Row', summary: [], commands };
  const legal = s?.legal;
  if (legal && legal.status !== 'closed') {
    if (legal.status === 'summons') {
      add('defender', 'Answer the summons with a public defender'); add('bail', 'Post $180 bail for a hearing tomorrow', {}, c.cash < 180 ? 'Requires $180' : undefined); add('serve', 'Serve 36 game hours and attend the hearing');
    }
    if (legal.status === 'jailed' && !legal.called) add('call-dana', 'Call Dana from the holding room');
    if (!s?.evidence.filter(e => legal.evidence.includes(e.id)).every(e => e.restitution)) add('restitution', `Offer documented restitution · $${restitutionCost(c)}`, {}, c.cash < restitutionCost(c) ? 'Insufficient cash' : undefined);
    if (legal.status === 'jailed') return { title: 'Halvern Holding and Legal Aid', summary: ['A charge is an allegation, not a conviction.', `Hearing ${legal.hearingAt}. Food and rest are provided.`, 'Only legal-aid decisions are available until release.'], commands };
  }
  const offers = market(store, now);
  for (const [key, offer] of Object.entries(offers.offers)) if (sku(key)) add('buy', `Buy ${GOODS[key].name} · $${offer.price} · ${offer.stock} left`, { sku: key }, c.cash < offer.price ? 'Insufficient cash' : offer.stock <= 0 ? 'Sold out today' : (s?.items.length ?? 0) >= 12 ? 'Inventory full' : undefined);
  for (const item of s?.items ?? []) {
    if (!sku(item.sku)) continue;
    const name = `${GOODS[item.sku].name} (${item.id.split(':').at(-1)})`;
    if (!item.inspected) add('inspect', `Inspect ${name}`, { item: item.id });
    else {
      if (item.defective && !item.repaired && !item.stolen) add('repair', `Repair ${name} · $${GOODS[item.sku].repair}`, { item: item.id }, c.cash < GOODS[item.sku].repair ? 'Insufficient cash' : undefined);
      if (item.stolen) { add('return', `Return ${name} for reimbursement`, { item: item.id }); add('sell', `Fence ${name} · $${GOODS[item.sku].resale} · recorded legal risk`, { item: item.id, disclose: false }); }
      else { add('sell', `Sell ${name} with honest condition`, { item: item.id, disclose: true }); if (item.defective && !item.repaired) add('sell', `Conceal the fault in ${name}`, { item: item.id, disclose: false }); }
    }
  }
  if (!s?.courier && (s?.lastCourierDay ?? -1) < Math.floor(now / DAY)) { add('courier', 'Take today’s sealed lunch route · $40 on completion', { opened: false }); add('courier', 'Take the route and read the folded note', { opened: true }); }
  if (s?.evidence.some(e => !e.resolved) && (!legal || legal.status === 'closed')) add('police-contact', 'Review the evidence with legal aid');
  if (legal?.outcome === 'convicted' && s?.repairedCase !== legal.id) add('community-work', `Complete record-repair day ${(s?.communityDays ?? 0) + 1}/3`);
  return { title: 'Market Row · trade, work and consequences', summary: [`Shared market day ${offers.day}. Stock is shared; transactions use server prices.`, `${s?.items.length ?? 0}/12 owned lots. Never trade the photograph.`, ...(legal ? [`Case ${legal.id}: ${legal.status}${legal.outcome ? ` · ${legal.outcome}` : ''}.`] : []), ...(s?.courier ? [`Courier return ${s.courier.due}.`] : [])], commands };
}
function restitutionCost(c: CharacterState) { const s = c.street!; return s.evidence.filter(e => s.legal?.evidence.includes(e.id) && !e.restitution).reduce((sum, e) => sum + (e.kind === 'fencing' ? 80 : 35), 0); }
export function streetAction(c: CharacterState, store: MemoryStore, p: Record<string, unknown>, now: number, seed: string): SystemResult {
  if (!eligible(c)) return deny('Street work is unavailable on this path or after the archive.');
  const s = streetState(c); const at = new Date(now).toISOString(); const legal = s.legal;
  if (legal?.status === 'jailed' && !['call-dana', 'restitution'].includes(String(p.op))) return deny('The hearing and release must happen before returning to the street.');
  if (p.op === 'buy') {
    if (!sku(p.sku)) return deny('Unknown market lot.');
    const offer = market(store, now, true).offers[p.sku]!;
    if (offer.stock <= 0 || c.cash < offer.price || s.items.length >= 12 || s.evidence.filter(e => !e.resolved).length >= 24) return deny('The lot is sold out, unaffordable, or your inventory is full.');
    c.cash -= offer.price; offer.stock--; const id = `${c.id}:lot:${++store.market.serial}`;
    s.items.push({ id, sku: p.sku, paid: offer.price, inspected: false, repaired: false, stolen: p.sku === 'bracelet' });
    return done(`You buy the ${GOODS[p.sku].name} at the posted price. ${p.sku === 'bracelet' ? 'The provenance warning stays attached to the lot.' : 'Sam leaves room on the tag for what you find.'}`, 15);
  }
  if (['inspect', 'repair', 'sell', 'return'].includes(String(p.op))) {
    const item = s.items.find(i => i.id === p.item); if (!item || !sku(item.sku)) return deny('You do not own this lot.');
    const good = GOODS[item.sku];
    if (p.op === 'inspect') { if (item.inspected) return deny('Already inspected.'); item.inspected = true; item.defective = !item.stolen && draw(seed, item.id) < .45; return done(item.stolen ? 'The engraving matches a reported loss. Sam will help return it; fencing it leaves a record.' : item.defective ? 'After warming up, the fault appears. Repair it, disclose it, or decide to hide it.' : 'The test is clean. Sam signs only what he checked.', 30); }
    if (!item.inspected) return deny('Inspect the lot before choosing its disposition.');
    if (p.op === 'repair') { if (!item.defective || item.repaired || item.stolen || c.cash < good.repair) return deny('This repair is unavailable or unaffordable.'); c.cash -= good.repair; item.repaired = true; return done('You replace the worn part and run a second test. The working condition now has a receipt.', 60); }
    if (p.op === 'return') { if (!item.stolen) return deny('This lot has no disputed owner.'); c.cash += item.paid; s.items = s.items.filter(i => i.id !== item.id); c.grit += 4; return done('The owner reimburses the purchase price. You return the engraving with the object, rather than selling a clean story about it.', 30); }
    if (typeof p.disclose !== 'boolean') return deny('State whether the condition is disclosed.');
    const dishonest = item.stolen || (!!item.defective && !item.repaired && !p.disclose);
    const price = item.defective && !item.repaired && p.disclose ? Math.floor(good.resale * .45) : good.resale;
    c.cash += price; s.items = s.items.filter(i => i.id !== item.id);
    if (dishonest) { c.heat = Math.min(100, c.heat + (item.stolen ? 24 : 12)); addEvidence(c, item.stolen ? 'fencing' : 'fraud', at, item.id); }
    else c.incomeConsistency = Math.min(100, c.incomeConsistency + 2);
    return done(`Sale recorded: $${price}. ${dishonest ? 'The buyer keeps the tag and the camera keeps the exchange. This may become evidence, not an automatic conviction.' : 'The receipt names the condition honestly. A reliable customer is worth more than one sale.'}`, 30);
  }
  if (p.op === 'courier') {
    const day = Math.floor(now / DAY);
    if (s.courier || s.lastCourierDay >= day || typeof p.opened !== 'boolean') return deny('No new courier demand today.');
    s.lastCourierDay = day; s.courier = { id: `${c.id}:route:${day}`, due: new Date(now + 90 * 60000).toISOString(), deadline: new Date(now + 2 * 3600000).toISOString(), opened: p.opened };
    c.location = 'Market Row Courier Route'; return done(p.opened ? 'You open the note: a clinic worker asks for a shift change so she can attend the inquiry. Knowing this is not the same as being invited to know.' : 'You keep the note folded. The person at the clinic will read it herself.', 90);
  }
  if (p.op === 'police-contact') {
    const evidence = s.evidence.filter(e => !e.resolved);
    if (!evidence.length || (legal && legal.status !== 'closed')) return deny('No new case is available.');
    s.caseNumber = (s.caseNumber ?? 0) + 1;
    s.legal = { id: `${c.id}:case:${s.caseNumber}`, status: 'summons', evidence: evidence.map(e => e.id), escrow: 0, defender: false, called: false }; s.communityDays = 0;
    return done('Legal aid shows you the specific sale records in the summons. Poverty, hunger and a high HEAT number are not evidence of an offense.', 15);
  }
  if (['defender', 'bail', 'serve'].includes(String(p.op))) {
    if (!legal || legal.status !== 'summons') return deny('No summons is awaiting a response.');
    if (p.op === 'bail' && c.cash < 180) return deny('Bail requires $180; a public defender remains available without payment.');
    legal.defender = p.op === 'defender'; legal.status = p.op === 'bail' ? 'released' : 'jailed'; legal.hearingAt = new Date(now + (p.op === 'bail' ? 24 : 36) * 3600000).toISOString();
    if (p.op === 'bail') { c.cash -= 180; legal.escrow = 180; }
    else { c.location = 'Halvern Holding Room'; c.needs.energy = Math.max(50, c.needs.energy); c.needs.hunger = Math.max(50, c.needs.hunger); }
    return done(p.op === 'bail' ? 'Bail is held in escrow, not sold as freedom from the charge. The hearing is tomorrow.' : 'Your hearing is scheduled. A bed and meals are provided. Dana’s number is beside the phone.', p.op === 'bail' ? 30 : 1);
  }
  if (p.op === 'call-dana') { if (legal?.status !== 'jailed' || legal.called) return deny('No call is available.'); legal.called = true; legal.defender = true; if (c.campaign) c.campaign.trust.dana += 5; return done('Dana finds a defender and tells the family center where you are. Telling the truth does not remove the absence; it stops making it somebody else’s mystery.', 1); }
  if (p.op === 'restitution') {
    if (!legal || legal.status === 'closed') return deny('No open case.'); const cost = restitutionCost(c);
    if (!cost || c.cash < cost) return deny('Restitution is already complete or unaffordable.');
    c.cash -= cost; for (const e of s.evidence) if (legal.evidence.includes(e.id)) e.restitution = true;
    return done('The receipts go to the court and the money goes to the harmed buyers. Restitution supports a diversion request; it is not a payment to police.', 30);
  }
  if (p.op === 'community-work') {
    if (legal?.outcome !== 'convicted' || s.repairedCase === legal.id) return deny('No record-repair placement is available.');
    s.communityDays++; c.grit += 3;
    if (s.communityDays >= 3) { c.record = Math.max(0, c.record - 1); s.repairedCase = legal.id; }
    return done(`Record-repair day ${s.communityDays}/3. ${s.communityDays >= 3 ? 'The nonviolent count is sealed after review; the harmed buyer’s receipt remains part of your history.' : 'Work, attend, return tomorrow. The review is earned rather than purchased.'}`, 1440);
  }
  return deny('Unknown street command.');
}
export function settleStreet(c: CharacterState, now: number): number {
  const s = c.street; if (!s || c.status === 'dead' || c.campaign?.perspective === 'adult-child') return 0;
  let net = 0;
  if (s.courier && now >= Date.parse(s.courier.due)) {
    const job = s.courier; delete s.courier; const pay = Date.parse(job.due) <= Date.parse(job.deadline) ? 40 : 20;
    c.cash += pay; net += pay; c.incomeConsistency = Math.min(100, c.incomeConsistency + 4);
    if (job.opened && c.campaign) { c.campaign.trust.nell -= 4; if (!c.campaign.flags.includes('courier-note-read')) c.campaign.flags.push('courier-note-read'); }
    narrate(c, job.due, 'courier_return', `$${pay} paid. ${job.opened ? 'Nell notices the broken fold. The worker’s story was hers to volunteer.' : 'The worker reads her note in private. You know only that she smiles.'}`);
  }
  const legal = s.legal;
  if (legal && ['jailed', 'released'].includes(legal.status) && legal.hearingAt && now >= Date.parse(legal.hearingAt)) {
    const evidence = s.evidence.filter(e => legal.evidence.includes(e.id));
    const diverted = legal.defender && evidence.every(e => e.restitution);
    legal.outcome = diverted ? 'diversion' : 'convicted'; legal.status = 'closed';
    const refund = Math.max(0, legal.escrow - (diverted ? 0 : 20)); legal.escrow = 0; c.cash += refund; net += refund;
    for (const e of evidence) e.resolved = true;
    s.evidence = [...s.evidence.filter(e => e.resolved).slice(-100), ...s.evidence.filter(e => !e.resolved)];
    if (!diverted) c.record = Math.min(10, c.record + 1);
    c.heat = Math.max(0, c.heat - 25); c.visitationAttendance = Math.max(0, c.visitationAttendance - (legal.called ? 5 : 10)); c.location = 'Halvern Legal Aid'; c.status = 'active';
    narrate(c, legal.hearingAt, 'legal_hearing', diverted ? `Documented restitution and a defender secure diversion. No new conviction. Escrow returned: $${refund}. The absence still belongs in the visitation record.` : `The court upholds the documented sale charge. One count enters the record; escrow refund $${refund}. A three-day record-repair placement is available. The allegation became a finding only at this hearing.`);
  }
  if (s.evidence.some(e => !e.resolved) && c.heat >= 50 && (!s.legal || s.legal.status === 'closed')) {
    const evidence = s.evidence.filter(e => !e.resolved); s.caseNumber = (s.caseNumber ?? 0) + 1; s.legal = { id: `${c.id}:case:${s.caseNumber}`, status: 'summons', evidence: evidence.map(e => e.id), escrow: 0, defender: false, called: false }; s.communityDays = 0;
    narrate(c, new Date(now).toISOString(), 'police_summons', 'HPD issues a summons tied to specific sale records. No conviction or custody penalty is imposed before the hearing.');
  }
  return net;
}
