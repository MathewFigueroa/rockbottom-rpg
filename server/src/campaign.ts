import { addEvidence } from "./streets.js";
import { createHash } from 'node:crypto';
import { CAMPAIGN_QUESTS, calculateCustody, type CampaignState, type CharacterState, type QuestDefinition, type QuestOption } from '@rockbottom/shared';

export function campaignState(c: CharacterState): CampaignState {
  return c.campaign ?? { version: 1, progress: {}, flags: [], trust: { sam: 0, dana: 0, nell: 0, vale: 0 }, aptitude: 0, rank: 'E-1', allotment: 0.1, supportPaid: 0, perspective: 'parent', events: [] };
}
export function completed(c: CharacterState, id: string) {
  const q = CAMPAIGN_QUESTS.find(q => q.id === id);
  return !!q && (c.campaign?.progress[id] ?? 0) >= q.stages.length;
}
function unlocked(c: CharacterState, q: QuestDefinition) {
  if (completed(c, q.id)) return false;
  if (q.id === 'the-frame') return c.status === 'dead' || (completed(c, 'day-thirty') && (!c.army || c.army.phase === 'discharged') && !c.street?.evidence.some(e => !e.resolved));
  if (c.status === 'dead' || c.act < 2 || (c.story?.stage ?? 0) < 2) return false;
  if (q.path && q.path !== c.story?.path) return false;
  if (q.after && !completed(c, q.after)) return false;
  if (q.id === 'keys') return completed(c, c.story?.path === 'street' ? 'the-flip' : 'first-rotation');
  if (q.id === 'day-thirty' && (c.story?.stage ?? 0) < 8) return false;
  return true;
}
function requirement(c: CharacterState, option: QuestOption): string | undefined {
  if (c.cash < (option.minimumCash ?? Math.max(0, -(option.cash ?? 0)))) return 'Insufficient cash';
  if (c.incomeConsistency < (option.minimumIncome ?? 0)) return `Requires income consistency ${option.minimumIncome}`;
  return undefined;
}
export function campaignView(c: CharacterState) {
  const state = campaignState(c);
  return { ...state, quests: CAMPAIGN_QUESTS.filter(q => unlocked(c, q)).map(q => {
    const step = state.progress[q.id] ?? 0; const stage = q.stages[step]!;
    return { id: q.id, title: q.title, step: step + 1, total: q.stages.length, objective: stage.objective,
      options: stage.options.map(option => ({ id: option.id, text: option.text, blocked: requirement(c, option), fatalRisk: option.lethalRisk ?? 0 })) };
  }) };
}

/** A seeded outcome is tied to this one non-repeatable quest stage, never client input. */
export function casualtyRoll(secret: string, characterId: string) {
  return createHash('sha256').update(`${secret}:${characterId}:first-rotation:route`).digest().readUInt32BE(0) / 0x100000000;
}
export function advanceQuest(c: CharacterState, params: Record<string, unknown>, now: string, seed: () => string): { ok: boolean; message: string; minutes: number } {
  const q = CAMPAIGN_QUESTS.find(q => q.id === params.quest);
  const fail = (message: string) => ({ ok: false, message, minutes: 0 });
  if (!q || !unlocked(c, q)) return fail('Quest is locked or already complete.');
  const state = campaignState(c); const step = state.progress[q.id] ?? 0; const stage = q.stages[step]!;
  const option = stage.options.find(o => o.id === params.choice);
  if (!option) return fail('Choose an available quest option.');
  const blocked = requirement(c, option); if (blocked) return fail(blocked);
  if (option.lethalRisk && params.confirmPermanentDeath !== true) return fail('Explicit permanent-death confirmation is required for this deployment.');
  c.campaign = state;
  c.cash += option.cash ?? 0; c.grit = Math.max(0, c.grit + (option.grit ?? 0));
  c.heat = Math.max(0, Math.min(100, c.heat + (option.heat ?? 0)));
  c.needs.energy = Math.max(0, Math.min(100, c.needs.energy + (option.energy ?? 0)));
  c.incomeConsistency = Math.max(0, Math.min(100, c.incomeConsistency + (option.income ?? 0)));
  c.record = Math.max(0, Math.min(10, c.record + (option.record ?? 0)));
  if (option.trust) state.trust[option.trust.person] = Math.max(-100, Math.min(100, state.trust[option.trust.person] + option.trust.delta));
  if (option.flag && !state.flags.includes(option.flag)) state.flags.push(option.flag);
  if (q.id === 'the-flip' && option.id === 'fence') addEvidence(c, 'fencing', now, `${c.id}:quest:bracelet`);
  if (q.id === 'the-flip' && option.id === 'hide') { addEvidence(c, 'fraud', now, `${c.id}:quest:radio`); c.heat = Math.min(100, c.heat + 12); }
  let message = option.detail;
  let minutes = stage.minutes;
  let roll: number | undefined;
  if (q.id === 'the-score' && option.flag === 'aptitude-correct') state.aptitude += 1;
  if (q.id === 'the-score' && step === q.stages.length - 1) {
    state.rank = (['E-1', 'E-2', 'E-3', 'E-4'] as const)[state.aptitude]!;
    message += ` Assessment: ${state.aptitude}/3. Entry rank ${state.rank}.`;
  }
  if (q.id === 'first-rotation' && stage.id === 'allotment') state.allotment = Number(option.id) / 100;
  if (option.lethalRisk) {
    roll = casualtyRoll(seed(), c.id);
    const gross = ({ 'E-1': 100, 'E-2': 120, 'E-3': 140, 'E-4': 160 } as const)[state.rank] * 3;
    const support = Math.floor(gross * state.allotment);
    state.supportPaid += support; c.cash += gross - support;
    c.visitationAttendance = Math.max(0, c.visitationAttendance - 15);
    message += ` Gross $${gross}; child support $${support}; net $${gross - support}. Risk ${option.lethalRisk * 100}%; audited roll ${roll.toFixed(6)}.`;
    if (roll < option.lethalRisk) {
      c.status = 'dead'; c.act = 3; state.perspective = 'adult-child';
      message += ' The convoy does not return intact. The transfer reaches home; you do not. The living parent’s actions are permanently closed. The archive remains for your child.';
    }
  }
  if (q.id === 'first-rotation' && option.id === 'decline') minutes = 30;
  if (q.id === 'keys' && option.id === 'sro') c.housing = 'sro';
  if (q.id === 'keys' && option.id === 'two-bedroom') c.housing = 'two-bedroom';
  if (q.id === 'day-thirty' && stage.id === 'order') {
    const custody = calculateCustody(c);
    message += ` Recorded custody score ${custody.score}: ${custody.level}.`;
    state.flags.push(`custody-order:${custody.level}`);
    c.act = 3;
  }
  if (q.id === 'the-frame') {
    state.perspective = 'adult-child';
    if (stage.id === 'uncertainty') {
      const flags = state.flags;
      message += flags.includes('heirloom-returned') ? ' The bracelet’s owner signed the return receipt. Sam’s memory has one independent witness.' : flags.includes('heirloom-fenced') ? ' The bracelet’s initials are gone. That absence belongs in the record too.' : ' The archive contains no bracelet receipt. You leave that space blank.';
      if (flags.includes('deployment-accepted')) message += ` The support ledger records $${state.supportPaid}. It cannot attend the missed visit.`;
      if (flags.includes('deployment-declined')) message += ' The refusal is in the personnel file. Staying home did not make the choice costless.';
      message += c.story?.choice === 'save_neighbors' ? ' Six names appear in the flood shelter register. None appear in the original’s margin.' : c.story?.choice === 'secure_ledger' ? ' Sam’s clinic receipt is folded inside the original ledger.' : '';
    }
    if (stage.id === 'ending') {
      const custody = state.flags.filter(f => f.startsWith('custody-order:')).at(-1)?.split(':')[1];
      state.ending = c.status === 'dead' ? 'HONOR' : custody === 'shared' ? 'FORGIVENESS' : state.flags.includes('heirloom-fenced') && state.flags.includes('wallet-kept') ? 'THE CYCLE' : 'THE OPEN DOOR';
      if (state.flags.includes('relapse-accepted')) message += ' Marcus kept a morning that the shelter log could not describe. The restart remains part of the record.';
      if (state.flags.includes('crew-rat')) message += ' The evidence payment and transit-camera image remain together. They do not settle the question of motive.';
      if (c.social?.completed.includes('sam-repair')) message += ' Sam’s repaired radio plays beside the box. Repair was a verb before it became a claim about a person.';
      if (state.flags.includes('public-fund:community')) message += ' Nell kept the relocation receipt. The unfilled household deposit is clipped behind it.';
      const echoes = message;
      message = `${state.ending}. ` + (c.status === 'dead' ? 'You can honor the parent without calling the risk a debt they owed you.' : custody === 'shared' ? 'I forgive the years you missed. I do not make them disappear. I keep the difference.' : 'The order did not grant every wish. The calls and the appointments after it still happened. An unfinished recovery is not an empty life.') + ` ${echoes}`;
    }
  }
  c.location = q.id === 'the-frame' ? 'The Kitchen Table · Years Later' : q.id === 'keys' ? 'Northside Housing Office' : q.id === 'day-thirty' ? 'Whitfield Family Court' : q.path === 'army' ? 'Fort Halvern Annex' : 'Market Row';
  if (c.status === 'dead') minutes = 1;
  state.progress[q.id] = step + 1;
  state.events.push({ sequence: state.events.length + 1, at: now, quest: q.id, stage: stage.id, choice: option.id, text: message, ...(roll === undefined ? {} : { risk: option.lethalRisk, roll }) });
  return { ok: true, message: `[${q.title} · ${stage.id}] ${message}`, minutes };
}
