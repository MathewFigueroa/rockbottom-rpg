import type { CharacterState, LifeCommand, LifeView, SocialState } from '@rockbottom/shared';
import type { MemoryStore } from './store.js';
import { deny, done, draw, narrate, type SystemResult } from './narrative.js';
const DAY = 86400000;
const eligible = (c: CharacterState) => c.act >= 2 && c.status !== 'dead' && c.campaign?.perspective !== 'adult-child' && !c.army?.deployed && c.street?.legal?.status !== 'jailed';
function state(c: CharacterState): SocialState { return c.social ??= { version: 1, completed: [] }; }
const VARIANTS = ['The rain has stopped, but the chairs are still wet.', 'A bus goes past without stopping. Nobody in the room looks up.', 'The kettle clicks off in the middle of a sentence.'];
function scene(c: CharacterState) {
  const e = c.social?.encounter;
  if (!e) return { text: 'There are people you have not asked how to help. Make room for one encounter.', options: [] as Array<[string, string]> };
  const scenes: Record<string, Array<{ text: string; options: Array<[string, string]> }>> = {
    'old-friends': [
      { text: `Marcus remembers the version of you who made everybody laugh before the bill arrived. He offers a rooftop night. Accepting risks 35–90% of your cash, resets sobriety and may cost a shelter bed. ${VARIANTS[e.variant]}`, options: [['roof', 'Go to the rooftop despite the risks'], ['decline', 'Take the second bus sober'], ['support', 'Ask Marcus to meet over breakfast instead']] },
      { text: e.choices.includes('roof') ? 'The morning contains the fun and the cost. Dana asks whether the shelter log is the whole account.' : 'Marcus sends a photograph of the empty chair. It could be a joke. It could be a request you have not learned to recognize.', options: [['truth', 'Tell Dana and Marcus the truth'], ['quiet', 'Restart quietly without an explanation'], ['conceal', 'Pretend nothing was missed']] },
      { text: 'Weeks later, Marcus calls when the room gets loud. He does not ask you to rescue him. He asks if you can stay on the line until the bus comes.', options: [['stay', 'Stay on the line'], ['boundary', 'Give him the support number and keep your appointment']] },
    ],
    'crew-up': [
      { text: 'Nia points to the memorial wall. “No tags there. If we cannot leave one thing alone, what are we protecting?” She offers a Riverfront Kings patch, not a clean history.', options: [['join', 'Join and keep the memorial unmarked'], ['independent', 'Stay independent and offer help without a patch']] },
      { text: 'A shared stash can buy meals or cover somebody’s bad night. Nia wants the withdrawal written where every member can see it. Your own $25 would pay for several dinners.', options: [['donate', 'Put $25 into the shared stash'], ['keep', 'Keep the money for your household']] },
      { text: 'You witness a crew sale using a stolen access badge. You can take the evidence to legal aid, confront Nia, or accept $120 for a report. A transit-camera record can reveal a paid informant later.', options: [['report', 'Report for the $120 evidence payment'], ['confront', 'Bring the evidence to Nia and demand restitution'], ['legal-aid', 'Bring the witness account to legal aid without payment']] },
    ],
    'sam-repair': [
      { text: c.campaign?.flags.includes('heirloom-fenced') ? 'Sam has not barred the door. He has stopped offering you the chair. The radio on his bench belonged to a tenant whose name disappeared from the ledger.' : 'Sam asks you to repair the radio with him. “Two people can agree on a story and still share one mistake. Let’s test the thing.”', options: [['repair', 'Pay $20 for parts and repair beside him'], ['space', 'Respect the distance and leave the chair empty']] },
      { text: 'Sam asks what you thought the buyer needed to hear. The question is about the radio; it is also about the inquiry.', options: [['own', 'Name the choice without improving it'], ['justify', 'Explain why the money felt urgent']] },
      { text: 'Sam plays the uncut interview. There is no confession hidden in the noise. There is a frightened child asking whether the recorder will remember the part nobody says.', options: [['preserve', 'Preserve the silence as part of the record'], ['annotate', 'Label what can and cannot be established']] },
    ],
    'public-fund': [
      { text: 'The inquiry settlement offers a small hardship payment. You can keep $160 for your household or direct $160 to the shared relocation fund. The child’s room needs a deposit; the next condemned block needs a van.', options: [['household', 'Keep the $160 household payment'], ['community', 'Direct the $160 to relocation']] },
      { text: 'Nell will read your statement at the next meeting. She asks whether your family belongs in the public story, or whether an address is already enough to expose.', options: [['private', 'Keep the child’s name out of the statement'], ['ask', 'Let the adult child decide what to share later']] },
      { text: 'Dana has the last duplicate. It includes the missed visit as well as the rescue. “Do you want a clean story,” she asks, “or one somebody can live after?”', options: [['whole', 'Keep the difficult parts together'], ['unfinished', 'Leave a page for what happens next']] },
    ],
  };
  return scenes[e.arc]![e.step]!;
}
export function socialView(c: CharacterState, store: MemoryStore, now: number): LifeView {
  const commands: LifeCommand[] = []; if (!eligible(c)) return { title: 'People of Halvern', summary: [], commands };
  const s = c.social; const current = scene(c);
  const add = (op: string, label: string, params: Record<string, string | number | boolean> = {}, blocked?: string) => commands.push({ action: 'life_action', label, params: { op, ...params }, blocked });
  if (s?.encounter) for (const [choice, label] of current.options) add('encounter', label, { choice }, choice === 'repair' && c.cash < 20 ? 'Requires $20' : choice === 'donate' && c.cash < 25 ? 'Requires $25' : undefined);
  else if (!s?.lastEncounter || now - Date.parse(s.lastEncounter) >= 6 * 3600000) add('seek', 'Make time for someone in Halvern');
  const crew = s?.crewId ? store.crews.get(s.crewId) : undefined;
  if (crew) {
    add('deposit', 'Contribute $10 to the shared crew treasury', {}, c.cash < 10 ? 'Requires $10' : undefined);
    add('aid', 'Ask the crew for $25 in mutual aid', {}, c.cash >= 50 ? 'Reserved for members below $50' : (crew.treasury ?? 0) < 25 ? 'Treasury below $25' : s?.lastAid && now - Date.parse(s.lastAid) < 7 * DAY ? 'A week between aid votes' : undefined);
    if (crew.informants?.length) add('camera', 'Review the discoverable transit-camera record');
  }
  return { title: 'People of Halvern', summary: [current.text, ...(crew ? [`${crew.name}: treasury $${crew.treasury ?? 0}; reputation ${crew.reputation}.`] : [])], commands };
}
function crew(store: MemoryStore) {
  let found = store.crews.get('riverfront-kings');
  if (!found) { found = { id: 'riverfront-kings', name: 'Riverfront Kings', members: [], allies: [], feuds: [], tags: ['memorial-unmarked'], reputation: 0, treasury: 120, informants: [] }; store.crews.set(found.id, found); store.cashFaucets += 120; }
  return found;
}
export function socialAction(c: CharacterState, store: MemoryStore, p: Record<string, unknown>, now: number, seed: string): SystemResult {
  if (!eligible(c)) return deny('This encounter is unavailable while away, detained or after the archive.');
  const s = state(c); const at = new Date(now).toISOString();
  if (p.op === 'seek') {
    if (s.encounter || (s.lastEncounter && now - Date.parse(s.lastEncounter) < 6 * 3600000)) return deny('An encounter is already open or another can wait until later.');
    const arcs = (['old-friends', 'crew-up', 'sam-repair', 'public-fund'] as const).filter(arc => !s.completed.includes(arc) && (arc !== 'sam-repair' || (c.campaign?.progress['the-flip'] ?? 0) >= 3) && (arc !== 'public-fund' || (c.story?.stage ?? 0) >= 8));
    if (!arcs.length) return deny('The known encounters are complete. Their consequences remain in the record.');
    const arc = arcs[Math.floor(draw(seed, `${c.id}:encounter:${s.completed.length}`) * arcs.length)]!;
    s.encounter = { id: `${c.id}:${arc}`, arc, step: 0, variant: Math.floor(draw(seed, `${c.id}:${arc}:variant`) * 3), expires: new Date(now + 2 * DAY).toISOString(), choices: [] };
    return done(scene(c).text, 15);
  }
  if (p.op === 'deposit' || p.op === 'aid' || p.op === 'camera') {
    const group = s.crewId ? store.crews.get(s.crewId) : undefined;
    if (!group || !group.members.includes(c.id)) return deny('Crew membership is required.');
    if (p.op === 'deposit') { if (c.cash < 10) return deny('Requires $10.'); c.cash -= 10; group.treasury = (group.treasury ?? 0) + 10; return done('The deposit is written in the shared ledger. It belongs to the treasury now, not to an invisible generosity score.', 10); }
    if (p.op === 'aid') { if (c.cash >= 50 || (group.treasury ?? 0) < 25 || (s.lastAid && now - Date.parse(s.lastAid) < 7 * DAY)) return deny('The aid conditions are not met.'); group.treasury = (group.treasury ?? 0) - 25; c.cash += 25; s.lastAid = at; return done('Nia records the approved $25 withdrawal. Help is not a debt she gets to collect in silence.', 10); }
    const records = group.informants ?? []; if (!records.length) return deny('No camera record is available.');
    group.reputation -= 4;
    return done(`The transit record identifies ${records.map(r => store.characters.get(r.characterId)?.name ?? 'a former member').join(', ')} at the evidence desk. Anonymous did not mean without a trace. The crew must decide what to do with knowledge, not invent certainty about motives.`, 30);
  }
  const e = s.encounter; if (p.op !== 'encounter' || !e || !scene(c).options.some(([id]) => id === p.choice)) return deny('Choose an option from the current encounter.');
  const choice = String(p.choice);
  if ((choice === 'repair' && c.cash < 20) || (choice === 'donate' && c.cash < 25)) return deny('This commitment is unaffordable.');
  const campaign = c.campaign; let text = '';
  if (e.arc === 'old-friends') {
    if (choice === 'roof') {
      const loss = Math.floor(c.cash * (.35 + draw(seed, `${e.id}:loss`) * .55)); c.cash -= loss; c.sobrietyDays = 0; c.needs.morale = Math.min(100, c.needs.morale + 45);
      const bedLost = c.housing === 'shelter' && draw(seed, `${e.id}:curfew`) < .6; if (bedLost) c.housing = 'underpass';
      text = `There is real laughter on the roof. Morning costs $${loss}, the sobriety streak${bedLost ? ' and the shelter bed' : ''}. Nobody calls the good part imaginary to make the cost easier to explain.`;
      campaign?.flags.push('relapse-accepted');
    } else if (choice === 'decline' || choice === 'support') { text = choice === 'support' ? 'Marcus agrees to breakfast, then asks if you can remind him. It is not a cure; it is a second plan.' : 'You catch the second bus. Marcus texts a joke before he texts that he got home.'; campaign?.flags.push('relapse-declined'); }
    else if (choice === 'truth') { c.grit += 8; if (campaign) campaign.trust.dana += 12; text = 'Dana hears the whole morning. She puts the shelter application beside the test form. Truth is the beginning of work, not a receipt for forgiveness.'; }
    else if (choice === 'conceal') { if (campaign) campaign.trust.dana -= 8; text = 'You keep the account short. Dana does not argue with the missing parts; she stops using it as her only source.'; }
    else text = choice === 'stay' ? 'You stay on the line until the brakes hiss. Marcus says nothing useful. The call still matters.' : choice === 'boundary' ? 'You keep your own appointment and help Marcus find somebody who can stay. A boundary can carry care without carrying every person.' : 'You restart the routine. The next morning is a morning, not a verdict.';
  } else if (e.arc === 'crew-up') {
    const group = crew(store);
    if (choice === 'join') { if (!group.members.includes(c.id)) group.members.push(c.id); s.crewId = group.id; text = 'The patch comes with a rule about the memorial and a place in the treasury ledger.'; }
    else if (choice === 'donate') { c.cash -= 25; group.treasury = (group.treasury ?? 0) + 25; group.reputation += 5; text = 'The $25 buys meals whether anybody remembers who put it there.'; }
    else if (choice === 'report') { c.cash += 120; group.reputation -= 40; (group.informants ??= []).push({ characterId: c.id, at }); campaign?.flags.push('crew-rat'); text = 'The $120 payment is recorded. The report has evidence, and the camera has you. Neither tells the whole account of why you chose it.'; }
    else if (choice === 'confront') { group.reputation += 3; text = 'Nia opens the stash ledger and arranges restitution. She does not ask you to mistake loyalty for a clean record.'; }
    else text = choice === 'legal-aid' ? 'Legal aid takes the witness account without a bounty. Nia may call it betrayal; the harmed person may call it a beginning.' : choice === 'independent' ? 'Nia leaves the patch on the table and keeps talking. Refusing membership did not require refusing the people.' : 'You keep the household money. Nia writes no debt beside your name.';
  } else if (e.arc === 'sam-repair') {
    if (choice === 'repair') { c.cash -= 20; if (campaign) campaign.trust.sam += 15; text = 'You replace the capacitor. Sam tests the radio himself. The repair does not buy back his trust; it gives you one honest hour together.'; }
    else if (choice === 'own') { if (campaign) campaign.trust.sam += 8; text = 'You name the choice without subtracting the need that made it tempting. Sam nods at both parts.'; }
    else text = choice === 'space' ? 'You leave the chair empty. Sam does not call after you. Respect can be quiet enough to look like nothing from outside.' : choice === 'justify' ? 'Sam believes the urgency. He asks you to believe that somebody else was urgent too.' : 'The recording keeps its silence. Your annotation describes the limits rather than filling them with a better person.';
  } else {
    if (choice === 'household') { c.cash += 160; text = 'The hardship payment enters the household budget. Nell says the relocation meeting will continue. Your child’s room is part of the city too.'; }
    else if (choice === 'community') { const group = crew(store); group.treasury = (group.treasury ?? 0) + 160; store.cashFaucets += 160; if (campaign) campaign.trust.nell += 12; text = 'The relocation van is booked. The deposit on your own room still needs paying. The choice can be generous and difficult in the same account.'; }
    else text = choice === 'private' ? 'Nell reads the statement without the child’s name. Privacy does not have to be earned by becoming uninteresting.' : choice === 'ask' ? 'You leave the choice for the person who will have to live with the public record.' : choice === 'whole' ? 'Dana staples the missed-visit slip behind the rescue register. Neither page is allowed to explain the other away.' : 'You leave a blank page. It is for the life after the inquiry, not a place to hide the inquiry itself.';
  }
  e.choices.push(choice); campaign?.flags.push(`${e.arc}:${choice}`); e.step++;
  if (e.step >= 3) { s.completed.push(e.arc); s.lastEncounter = at; delete s.encounter; }
  return done(text, 30);
}
export function settleSocial(c: CharacterState, now: number) {
  const e = c.social?.encounter;
  if (e && c.status !== 'dead' && now >= Date.parse(e.expires) && c.campaign?.perspective !== 'adult-child') { c.social!.completed.push(e.arc); c.social!.lastEncounter = new Date(now).toISOString(); delete c.social!.encounter; narrate(c, new Date(now).toISOString(), 'unanswered_letter', 'The invitation passes without an answer. The archive records an unanswered letter, not the reason you could not answer.'); }
}
