import type { CharacterState } from '@rockbottom/shared';
import { campaignView } from './campaign.js';
import { storyView } from './story.js';
import { lifeView } from './systems.js';
import type { MemoryStore } from './store.js';

export function decisionContext(c: CharacterState, store: MemoryStore, now: number) {
  const campaign = campaignView(c);
  const narrative = storyView(c);
  const life = lifeView(c, store, now);
  const actions: Array<{ action: string; params: Record<string, unknown>; purpose: string; category: 'progress' | 'recovery' | 'income' | 'optional'; permanentDeathRisk?: number }> = [];
  const add = (action: string, purpose: string, category: 'progress' | 'recovery' | 'income' | 'optional', params = {}) => actions.push({ action, params, purpose, category });
  const indoor = !['underpass', 'tent'].includes(c.housing);
  const canEarn = c.needs.hunger >= 25 || c.cash < 6;
  const parent = c.status !== 'dead' && c.campaign?.perspective !== 'adult-child';
  const occupied = c.army?.deployed || c.street?.courier || c.street?.legal?.status === 'jailed';
  if (parent && !occupied) {
    if (c.needs.hunger < 60 && c.cash >= 6) add('eat_diner', 'Costs $6; restores 36 hunger and 5 morale. Food does not complete a work shift.', 'recovery');
    if (indoor && (c.needs.energy < 60 || (c.act === 1 && c.questStep === 2 && c.shelterDays < 7))) add('sleep_shelter', 'Restores energy to 100; adds one bed day. Extra nights beyond seven do not replace the four required work shifts.', c.act === 1 && c.shelterDays < 7 ? 'progress' : 'recovery');
    if (!indoor && c.cash >= 50) add('claim_shelter', 'Requires $50 cash on hand; provides an indoor bed. No fee is deducted.', 'progress');
    if (c.act === 1) {
      if (canEarn && c.questStep === 0 && c.cash < 50 && c.needs.energy >= 6) add('collect_recycling', 'Earns $18 and costs 6 energy. This is not a paid work shift.', 'income');
      if (canEarn && c.needs.energy >= 15 && (c.shiftsWorked < 4 || c.cash < 6)) add('day_labor', 'Eight-hour paid shift: earns $42, costs 14 energy and 9 hunger; counts toward the four required shifts.', 'progress');
      if (c.questStep === 3) add('attend_visitation', 'Attend the scheduled visit and unlock Act 2. More sleep or recycling will not attend it for you.', 'progress');
    } else {
      if (canEarn && c.needs.energy >= 15) add('day_labor', 'Earn $42 and build income consistency for housing; costs energy and hunger.', 'income');
      if (canEarn && c.needs.energy >= 6) add('collect_recycling', 'Earn $18; costs 6 energy. Does not advance an inquiry or count as a work shift.', 'income');
    }
    if (!actions.length) add('safe_idle', 'Emergency recovery routine: restores food/energy and keeps an existing bed. Does not count as a work shift.', 'recovery');
  }
  for (const choice of narrative.availableChoices) add('story_decision', narrative.prompt ?? c.activeObjective, 'progress', { choice });
  for (const quest of campaign.quests) for (const option of quest.options) if (!option.blocked) {
    actions.push({ action: 'quest_choice', params: { quest: quest.id, choice: option.id }, purpose: `${quest.title}: ${option.text}`, category: 'progress', ...(option.fatalRisk ? { permanentDeathRisk: option.fatalRisk } : {}) });
  }
  for (const command of life.commands) if (!command.blocked) actions.push({ action: command.action, params: command.params, purpose: command.label, category: ['answer', 'input', 'finish-assessment', 'train', 'call-dana', 'restitution'].includes(String(command.params.op)) || (command.action === 'life_action' && c.social?.encounter) ? 'progress' : 'optional' });
  return {
    objective: c.activeObjective,
    urgent_needs: [c.needs.hunger < 25 ? 'Hungry: eat before choosing another earning task.' : '', c.needs.energy < 15 ? 'Exhausted: recover before paid work.' : ''].filter(Boolean),
    milestones: { act: c.act, questStep: c.questStep, bedDays: Math.min(7, c.shelterDays), workShifts: Math.min(4, c.shiftsWorked), visitation: c.visitationAttendance, storyStage: c.story?.stage ?? 0, quests: campaign.progress, armyPhase: c.army?.phase, trainingDays: c.army?.trainingDays, ending: campaign.ending, armyAssessment: c.army?.assessment.index, drill: c.army?.drill?.index, rotation: c.army?.rotation, legal: c.street?.legal, resolvedEvidence: c.street?.evidence.filter(e => e.resolved).length, social: c.social?.encounter && { id: c.social.encounter.id, step: c.social.encounter.step }, completedArcs: c.social?.completed },
    recent_actions: c.actionLog.slice(0, 8).map(({ action, detail }) => ({ action, detail })),
    actions,
    note: 'This menu guides the model runner; the server still validates every submitted action. Choose exact action and params. Cash gains and repeated full-health sleep are not story progress. Risky deployment still requires your explicit permanent-death confirmation.',
  };
}
