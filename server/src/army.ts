import type { ArmyState, CharacterState, LifeCommand, LifeView } from '@rockbottom/shared';
import { campaignState } from './campaign.js';
import { deny, done, draw, narrate, type SystemResult } from './narrative.js';
const DAY = 86400000;
const BASE = { 'E-1': 400, 'E-2': 480, 'E-3': 560, 'E-4': 640 };
// The full battery is distinct from the earlier short logistics orientation.
const QUESTIONS = [
  ['Twelve crates hold six bottles each. Eighteen are reserved. Bottles remaining?', ['54', '90', '36'], 0],
  ['A map uses 1 cm for 2 km. A route is 4 cm. Distance?', ['2 km', '6 km', '8 km'], 2],
  ['Which is a complete evacuation order?', ['Move now', 'Named route, source and timestamp', 'The loudest message'], 1],
  ['A 20% allotment from $500 leaves what net?', ['$480', '$400', '$100'], 1],
  ['A loose load shifts backward. First action?', ['Accelerate', 'Ignore it', 'Stop and secure it'], 2],
  ['Which source best establishes a sequence?', ['Contemporaneous dispatch timestamps', 'A repeated rumor', 'An unsigned summary'], 0],
  ['Three vehicles carry eight people each. Six dismount. Still aboard?', ['18', '24', '30'], 0],
  ['A frayed lifting strap is found before loading. What next?', ['Hide the fray', 'Replace the strap', 'Double the load'], 1],
  ['A clinic needs 36 liters. Containers hold nine each. Containers required?', ['3', '5', '4'], 2],
  ['Two orders conflict. What do you transmit?', ['An invented compromise', 'Only the newer-looking paper', 'Request clarification and preserve both'], 2],
  ['Which route avoids an unverified bridge load limit?', ['The surveyed ridge', 'The shortest line', 'The busiest bridge'], 0],
  ['A squadmate makes an error. What belongs in the debrief?', ['A scapegoat', 'The error, conditions and correction', 'Nothing if delivery succeeded'], 1],
] as const;
const INPUTS = ['left', 'action', 'right', 'action', 'hold'];
export function armyEligible(c: CharacterState) { return c.act >= 2 && c.story?.path === 'army' && c.status !== 'dead' && c.campaign?.perspective !== 'adult-child'; }
export function riskFor(a: ArmyState, withSquad: boolean, tactic: string) {
  const squadSize = withSquad ? 1 + Number(a.squad.petty) + Number(a.squad.dominguez) : 1;
  const base = a.offer?.baseRisk ?? .14;
  return Math.min(.9, Math.max(0, base * (1 - a.discipline * .06) * (1 - Math.min(squadSize - 1, 3) * .08) + (tactic === 'driver' ? .09 : tactic === 'cover' ? .04 : 0)));
}
function startTerm(a: ArmyState, now: number) {
  a.phase = 'active'; a.paychecks = 0; a.termEnd = new Date(now + 60 * DAY).toISOString(); a.nextPay = new Date(now + 7 * DAY).toISOString(); a.nextOffer = new Date(now + 14 * DAY).toISOString();
}
export function armyView(c: CharacterState, now: number): LifeView {
  const a = c.army; const commands: LifeCommand[] = [];
  const add = (op: string, label: string, params: Record<string, string | number | boolean> = {}, consent = false) => commands.push({ action: 'army_action', label, params: { op, ...params }, consent });
  if (!armyEligible(c)) return { title: 'Army service', summary: [], commands };
  if (!a) add('enroll', 'Begin the full twelve-question assessment');
  else if (a.phase === 'assessment') {
    if (now >= Date.parse(a.assessment.deadline)) add('finish-assessment', 'Submit the timed assessment');
    else { const q = QUESTIONS[a.assessment.index]; if (q) q[1].forEach((answer, index) => add('answer', answer, { answer: index })); }
  } else if (a.phase === 'training') {
    if (a.drill) INPUTS.filter((v, i, arr) => arr.indexOf(v) === i).forEach(input => add('input', input, { input }));
    else add('start-drill', `Begin training day ${a.trainingDays + 1} · 18-second drill`);
  } else if (a.phase === 'active') {
    if (a.deployed) return { title: 'On rotation', summary: [`Return due ${a.deployed.due}. The outcome will resolve at return time.`, 'Your squad is beyond the signal tower.'], commands };
    add('duty', 'Complete one day of regular duty');
    if (a.paychecks === 0) [10, 20, 28].forEach(p => add('allotment', `Set ${p}% child support for this term`, { percent: p }));
    if (a.offer) {
      add('decline', 'Decline the rotation and remain home');
      for (const withSquad of [true, false]) for (const tactic of ['cover', 'driver', 'cargo']) add('deploy', `${withSquad ? 'Squad' : 'Solo'} · ${tactic} · ${(riskFor(a, withSquad, tactic) * 100).toFixed(2)}% fatal risk`, { withSquad, tactic, offer: a.offer.id }, true);
    }
  } else if (a.phase === 'terminal-leave') { add('discharge', 'Take honorable discharge and the housing voucher'); add('reup', 'Re-enlist · higher pay and higher rotation risk'); }
  const question = a?.phase === 'assessment' ? QUESTIONS[a.assessment.index]?.[0] : undefined;
  return { title: 'Army service', summary: a ? [question ?? `${a.phase} · ${a.rank} · term ${a.term}`, `Training ${a.trainingDays}/3 days; next input: ${a.drill ? INPUTS[a.drill.index] : 'none'}.`, `Assessment deadline ${a.assessment.deadline}.`, `Gross paid $${a.grossPaid}; support $${a.supportPaid}.`, ...(a.nextPay ? [`Next payday ${a.nextPay}; term end ${a.termEnd}.`] : [])] : ['A full timed battery, three days of training, sixty-day terms and weekly automatic support transfers.'], commands };
}
export function armyAction(c: CharacterState, p: Record<string, unknown>, now: number): SystemResult {
  if (!armyEligible(c)) return deny('Army service is unavailable on this path or after the archive opens.');
  let a = c.army;
  if (p.op === 'enroll') {
    if (a) return deny('An enlistment record already exists.');
    c.army = { version: 1, phase: 'assessment', assessment: { index: 0, correct: 0, deadline: new Date(now + 180000).toISOString(), finished: false }, trainingDays: 0, discipline: 0, term: 1, paychecks: 0, grossPaid: 0, supportPaid: 0, rank: 'E-1', allotment: .2, squad: { petty: true, dominguez: true, bond: 0 }, rotation: 0, history: [] };
    return done('The battery begins. Twelve answers; three game minutes. Unanswered questions do not count as correct.', 0, true);
  }
  if (!a) return deny('Begin the assessment first.');
  if (a.phase === 'assessment') {
    if (!['answer', 'finish-assessment'].includes(String(p.op))) return deny('The assessment is in progress.');
    if (p.op === 'answer' && now < Date.parse(a.assessment.deadline)) {
      if (!Number.isInteger(p.answer) || Number(p.answer) < 0 || Number(p.answer) > 2) return deny('Choose one of the current question’s three answers.');
      if (p.answer === QUESTIONS[a.assessment.index]![2]) a.assessment.correct++;
      a.assessment.index++;
    } else if (p.op === 'finish-assessment' && now < Date.parse(a.assessment.deadline)) return deny('The assessment is still open.');
    if (a.assessment.index === 12 || now >= Date.parse(a.assessment.deadline)) {
      const score = a.assessment.correct; a.rank = score >= 11 ? 'E-4' : score >= 9 ? 'E-3' : score >= 6 ? 'E-2' : 'E-1';
      a.assessment.finished = true; a.phase = 'training';
      return done(`Assessment recorded: ${score}/12, ${a.rank}. Vance points toward the training ground. “A score opens a door. It does not carry a crate.”`, 0, true);
    }
    return done(`Answer ${a.assessment.index}/12 recorded.`, 0, true);
  }
  if (a.phase === 'training') {
    if (p.op === 'start-drill' && !a.drill) { a.drill = { index: 0, mistakes: 0, deadline: new Date(now + 18000).toISOString() }; return done('Crawl, wall, balance, carry, hold. Follow the displayed input sequence before the eighteen-second deadline.', 0, true); }
    if (p.op !== 'input' || !a.drill || !INPUTS.includes(String(p.input))) return deny('Start a drill and submit a displayed input.');
    if (now >= Date.parse(a.drill.deadline)) { delete a.drill; return done('The whistle goes. Vance schedules another attempt after rest, not another person to blame.', 60); }
    if (p.input !== INPUTS[a.drill.index]) a.drill.mistakes++;
    a.drill.index++;
    if (a.drill.index < INPUTS.length) return done('Input recorded.', 0, true);
    const passed = a.drill.mistakes <= Math.floor(a.discipline / 2); delete a.drill;
    if (!passed) return done('The load touches the ground. Own the miss, rest, then try again.', 60);
    a.trainingDays++; a.discipline = Math.min(3, a.discipline + 1); a.squad.bond += 4;
    if (a.trainingDays === 3) { startTerm(a, now + DAY); c.incomeConsistency = Math.min(100, c.incomeConsistency + 15); }
    return done(`Training day ${a.trainingDays}/3 complete. ${a.trainingDays === 3 ? 'Your sixty-day term begins after the final training day.' : 'The next drill follows a full day of training and rest.'}`, 1440);
  }
  if (a.phase === 'terminal-leave') {
    if (p.op === 'discharge') { a.phase = 'discharged'; if (['underpass', 'tent', 'shelter'].includes(c.housing)) c.housing = 'sro'; c.grit += 20; return done('The voucher is real. So is the empty week after formation stops. Petty writes his number on the back: “Call before the room gets too quiet.”', 60); }
    if (p.op === 'reup') { a.term++; startTerm(a, now); return done('You sign another sixty days. The pay is higher; so is the risk. Dana asks which dates you can still promise.', 60); }
    return deny('Choose discharge or another term.');
  }
  if (a.phase !== 'active' || a.deployed) return deny('This service action is unavailable.');
  if (p.op === 'allotment') {
    if (a.paychecks || ![10, 20, 28].includes(Number(p.percent))) return deny('The term’s allotment is locked after its first payment.');
    a.allotment = Number(p.percent) / 100; return done(`Child support set to ${p.percent}%. It locks at the first payday.`, 1);
  }
  if (p.op === 'duty') { c.needs.energy = Math.max(20, c.needs.energy - 8); c.location = 'Fort Halvern Annex'; return done('Supply counts, repaired straps, a phone call after lights-out. Ordinary duty is still service.', 1440); }
  if (!a.offer || Date.parse(a.offer.expires) < now) return deny('No current deployment offer.');
  if (p.op === 'decline') { delete a.offer; a.nextOffer = new Date(now + 14 * DAY).toISOString(); c.grit = Math.max(0, c.grit - 5); return done('The refusal enters the file. You remain available for home visits. Vale does not pretend either choice is free.', 30); }
  if (p.op === 'deploy') {
    if (p.offer !== a.offer.id || typeof p.withSquad !== 'boolean' || !['cover', 'driver', 'cargo'].includes(String(p.tactic)) || p.confirmPermanentDeath !== true) return deny('Use the current offer, a valid squad/tactic selection, and explicit permanent-death confirmation.');
    if (p.withSquad && !a.squad.petty && !a.squad.dominguez) return deny('No surviving squadmates are available for this rotation.');
    const risk = riskFor(a, p.withSquad, String(p.tactic));
    a.deployed = { id: a.offer.id, due: new Date(now + a.offer.days * DAY).toISOString(), risk, squadRisk: p.tactic === 'cargo' ? .2 : .06, gross: Math.round(BASE[a.rank] * 2 * (a.term > 1 ? 1.35 : 1)), withSquad: p.withSquad, tactic: String(p.tactic) };
    const days = a.offer.days; delete a.offer; c.location = 'Supply Rotation · Beyond the Signal Tower';
    return done(`Departure recorded. Fatal risk ${(risk * 100).toFixed(2)}%. ${p.tactic === 'cargo' ? 'Protecting the cargo leaves the disabled vehicle more exposed.' : 'Your squad knows the plan before the radio goes quiet.'} The result will resolve at the scheduled return.`, days * 1440);
  }
  return deny('Unknown Army command.');
}
export function settleArmy(c: CharacterState, now: number, seed: string): number {
  const a = c.army; if (!a || c.status === 'dead' || c.campaign?.perspective === 'adult-child') return 0;
  if (a.phase === 'assessment' && now >= Date.parse(a.assessment.deadline)) {
    const result = armyAction(c, { op: 'finish-assessment' }, now);
    narrate(c, new Date(now).toISOString(), 'assessment_closed', result.message);
    c.nextDecisionAt = new Date(now).toISOString();
  }
  if (a.drill && now >= Date.parse(a.drill.deadline)) {
    delete a.drill; c.nextDecisionAt = new Date(now + 3600000).toISOString();
    narrate(c, new Date(now).toISOString(), 'training_timeout', 'The drill expires. Vance schedules rest before another attempt.');
  }
  let netPaid = 0;
  const pay = (gross: number, at: number, description: string) => { const support = Math.floor(gross * a.allotment); const net = gross - support; a.grossPaid += gross; a.supportPaid += support; c.cash += net; netPaid += net; const campaign = c.campaign ??= campaignState(c); campaign.supportPaid += support; narrate(c, new Date(at).toISOString(), 'service_pay', `${description}: gross $${gross}, child support $${support}, net $${net}. The transfer leaves before the rest reaches you.`); };
  // Resolve the rotation before later paychecks so death cannot receive future wages.
  const deployment = a.deployed;
  const fatalAt = deployment && now >= Date.parse(deployment.due) && draw(seed, `${c.id}:rotation:${deployment.id}:parent`) < deployment.risk ? Date.parse(deployment.due) : Infinity;
  const payThrough = Math.min(now, Date.parse(a.termEnd ?? new Date(now).toISOString()), fatalAt);
  while (a.nextPay && Date.parse(a.nextPay) <= payThrough) {
    const at = Date.parse(a.nextPay); pay(Math.round(BASE[a.rank] * (a.term > 1 ? 1.35 : 1)), at, 'Weekly service pay'); a.paychecks++; a.nextPay = new Date(at + 7 * DAY).toISOString(); c.incomeConsistency = Math.min(100, c.incomeConsistency + 4);
  }
  if (deployment && now >= Date.parse(deployment.due)) {
    const at = Date.parse(deployment.due); const roll = draw(seed, `${c.id}:rotation:${deployment.id}:parent`); const survived = roll >= deployment.risk;
    if (deployment.withSquad) {
      if (a.squad.petty && draw(seed, `${c.id}:rotation:${deployment.id}:petty`) < deployment.squadRisk) a.squad.petty = false;
      if (a.squad.dominguez && draw(seed, `${c.id}:rotation:${deployment.id}:dominguez`) < deployment.squadRisk) a.squad.dominguez = false;
    }
    pay(deployment.gross, at, 'Rotation bonus'); c.visitationAttendance = Math.max(0, c.visitationAttendance - 10);
    a.history.push({ id: deployment.id, at: deployment.due, risk: deployment.risk, roll, survived, petty: a.squad.petty, dominguez: a.squad.dominguez }); a.history = a.history.slice(-100);
    delete a.deployed; a.nextOffer = new Date(at + (14 + Math.floor(draw(seed, `${c.id}:offer-delay:${deployment.id}`) * 8)) * DAY).toISOString();
    if (!survived) { c.status = 'dead'; c.act = 3; const campaign = c.campaign ??= campaignState(c); campaign.perspective = 'adult-child'; }
    narrate(c, deployment.due, 'rotation_return', `${survived ? 'You return. The absence still counts.' : 'The transfer arrives. You do not. The parent’s actions are permanently closed.'} Risk ${(deployment.risk * 100).toFixed(2)}%; recorded roll ${roll.toFixed(6)}. Petty ${a.squad.petty ? 'alive' : 'killed'}; Dominguez ${a.squad.dominguez ? 'alive' : 'killed'}.`, 'consequence');
    if (!survived) return netPaid;
    c.location = 'Fort Halvern Annex'; c.status = 'active';
    if (a.history.length % 2 === 0) { const ranks = ['E-1', 'E-2', 'E-3', 'E-4'] as const; a.rank = ranks[Math.min(3, ranks.indexOf(a.rank) + 1)]!; }
  }
  if (a.phase === 'active' && a.termEnd && now >= Date.parse(a.termEnd) && !a.deployed) { a.phase = 'terminal-leave'; delete a.offer; narrate(c, a.termEnd, 'terminal_leave', 'Sixty days. Vale places the voucher beside a fresh contract. One offers a room; the other offers another dependable Friday. Neither can answer for your child.'); }
  if (a.phase === 'active' && !a.deployed && a.nextOffer && now >= Date.parse(a.nextOffer) && !a.offer) {
    a.rotation++; a.offer = { id: a.rotation, expires: new Date(now + 3 * DAY).toISOString(), days: 3 + Math.floor(draw(seed, `${c.id}:offer-days:${a.rotation}`) * 3), baseRisk: a.term > 1 ? .168 : .14 };
    narrate(c, new Date(now).toISOString(), 'rotation_offer', 'An offer waits beside your next home visit. The number is visible before the signature. Petty asks whether you want company.');
  }
  if (a.offer && now > Date.parse(a.offer.expires)) { delete a.offer; a.nextOffer = new Date(now + 14 * DAY).toISOString(); }
  return netPaid;
}
