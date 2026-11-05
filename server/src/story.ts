import { completed, campaignState } from './campaign.js';
import { STORY_PROMPTS, STORY_CHOICES, type CharacterState } from '@rockbottom/shared';

export interface NarrativeEvent { sequence: number; timeline: string; title: string; text: string }
export interface StoryState { version: 1; stage: number; path: 'street' | 'army' | null; choice: string | null; events: NarrativeEvent[] }
export const CHAPTERS = [
  { timeline: 'DAY 30 · THE HEARING', title: 'The empty chair', text: 'A clerk asks why the evacuation ledger carries your signature. The chair beside you is empty. You remember promising you would be there.' },
  { timeline: 'DAY -18 · THE FALL', title: 'Two minutes', text: 'The Route 9 retaining wall fell at 05:42. You opened the service gate to let trapped tenants out. The city charged you with trespass; the contractor withheld your pay. Debt, eviction, missed visits. Recovery began long before anyone called it courage.' },
  { timeline: 'DAY 8 · THE SECOND COPY', title: 'A name below yours', text: 'Sam finds two evacuation lists. One records homes. The other records billable vacancies. Your signature was copied onto the second. Dana recognizes a shelter resident who was listed as an empty address.' },
  { timeline: 'DAY 12 · THE LOAD', title: 'Who gets carried', text: 'A flood warning puts the annex generator and Mercy House on the same failing circuit. Sergeant Imani Vale has transport; street organizer Nell has the keys. Neither has enough time. Take the ledger to court, or carry people to higher ground and let its courier leave.' },
  { timeline: 'DAY -19 · THE ORDER', title: 'Before the signature', text: 'Vale authorized the evacuation rehearsal, not the demolition. Dana hid the duplicate to protect a resident without papers. Sam repaired the recorder but cut out a frightened child’s name. Every witness preserved someone; together they made the truth look like a lie.' },
  { timeline: 'DAY 30 · THE HEARING', title: 'The chair is yours', text: 'The empty chair was never your child’s. It was reserved for the resident the ledger erased. The hearing is a public inquiry running beside family court. Your recovery cannot be entered as proof that nobody else was hurt.' },
  { timeline: 'DAY 31 · TWO DOORS', title: 'Tuesday', text: 'The audit briefing and the family center face opposite sides of the same block. Your phone carries two reminders. Neither says optional.' },
  { timeline: 'DAY 32 · THE PUBLIC COPY', title: 'What the city may keep', text: 'The contractor’s lawyer offers a settlement for silence. Dana refuses to decide for the residents. Nell asks whether accountability can survive with the addresses blacked out.' },
] as const;
export function storyState(c: CharacterState): StoryState { return c.story ?? { version: 1, stage: 0, path: null, choice: null, events: [] }; }
export function storyView(c: CharacterState) { const s = storyState(c); return { ...s, prompt: STORY_PROMPTS[s.stage], availableChoices: choices(c) }; }
export function choices(c: CharacterState): string[] {
  const s = storyState(c);
  if (c.act < 2) return [];
  if (c.status === 'dead') return [];
  if (s.stage === 2 && !completed(c, s.path === 'street' ? 'the-flip' : 'first-rotation')) return [];
  return [...(STORY_CHOICES[s.stage] ?? [])];
}
export function advanceStory(c: CharacterState, choice: unknown): { ok: boolean; message: string } {
  const s = storyState(c);
  if (typeof choice !== 'string' || !choices(c).includes(choice)) return { ok: false, message: 'Choose an available story decision after the first visitation.' };
  c.story = s;
  const chapter = CHAPTERS[s.stage]!;
  let consequence = '';
  if (choice === 'street' || choice === 'army') {
    s.path = choice;
    c.location = choice === 'street' ? 'Okafor Pawn & Repair' : 'Fort Halvern Annex';
    consequence = choice === 'street' ? 'Nell offers local trust and irregular work. You will trace the duplicate through the repair shops.' : 'Vale offers supervised logistics duty, regular pay and an obligation to document orders. You will trace the duplicate through the annex archive.';
  }
  if (choice === 'verify_copy') {
    c.inventory.push('verified-ledger');
    const campaign = campaignState(c);
    consequence = s.path === 'army' ? campaign.flags.includes('route-log-open') ? 'Vale signs a chain-of-custody receipt, risking her promotion. Your unedited route log gives her a precedent she cannot ignore.' : 'Vale authenticates the dispatch times but refuses to call your edited report complete. Dominguez supplies the missing page under her own name.' : campaign.trust.sam >= 0 ? 'Sam brings the repair receipt. Nell brings two tenants who agree to authenticate the addresses; you ask before recording them.' : 'Sam will not lend you his certainty after the bracelet sale. Nell finds independent tenant records. The ledger survives; your friendship has not caught up.';
  }
  if (choice === 'save_neighbors' || choice === 'secure_ledger') {
    s.choice = choice;
    if (choice === 'save_neighbors') { c.needs.energy = Math.max(0, c.needs.energy - 15); c.grit += 8; c.inventory = c.inventory.filter(i => i !== 'verified-ledger'); consequence = 'You carry six residents out. The original leaves town. Your case now rests on witnesses who can refuse to testify.'; }
    else { c.heat += 12; consequence = 'You secure the original. Nell evacuates the house without you; Sam injures his hand carrying the last resident. He will recover. He will remember.'; }
  }
  if (choice === 'challenge_dana' || choice === 'challenge_vale') {
    const campaign = c.campaign ??= campaignState(c);
    const person = choice === 'challenge_dana' ? 'dana' : 'vale';
    campaign.trust[person] -= 8;
    campaign.flags.push(`challenged-${person}`);
    consequence = person === 'dana' ? 'You ask Dana to put the concealment on the record. She agrees, then asks that the resident decide whether to be named. Her mistake is testimony, not permission to use someone else.' : 'You ask Vale to correct her own order in public. She does. The timestamp shows that the contractor received the warning before the gate was opened. Her command was negligent; the later vacancy ledger was deliberate.';
  }
  if (choice === 'publish_names' || choice === 'protect_witnesses') {
    c.act = 3;
    consequence = choice === 'publish_names' ? 'The inquiry can compel an audit, but the witness addresses become public. Dana asks whose safety you counted as a cost.' : 'A sealed affidavit preserves witness privacy. The audit will take longer. Vale agrees to testify under her own name.';
    consequence += s.choice === 'save_neighbors' ? ' The rescued residents choose to attend. Their presence is evidence you could not seize.' : ' Sam sends the uncut recording. His note says: a record can be repaired; trust takes longer.';
    consequence += ' Your child asks whether you will come on Tuesday. You promise only Tuesday. Custody still depends on housing, visits and sustained care.';
  }
  if (choice === 'return_tuesday' || choice === 'follow_audit') {
    const campaign = c.campaign ??= campaignState(c);
    campaign.flags.push(choice);
    if (choice === 'return_tuesday') {
      c.visitationAttendance = Math.min(100, c.visitationAttendance + 10);
      campaign.trust.dana += 6;
      consequence = `${c.childName} has saved the window seat. You explain only why you are on time. Across the street Nell reads your statement without you. The city can survive one meeting without its symbol.`;
    } else {
      c.visitationAttendance = Math.max(0, c.visitationAttendance - 20);
      campaign.trust.nell += 6;
      consequence = 'The briefing uncovers a second condemned block. The family-center log records another empty chair. Both things happened. Your statement cannot stand in for the visit.';
    }
  }
  if (choice === 'release_record' || choice === 'keep_private') {
    const campaign = c.campaign ??= campaignState(c); campaign.flags.push(choice);
    consequence = choice === 'release_record' ? 'The public copy names the contractor and the authorizing officers, with consenting testimony and redacted addresses. The redactions mark a duty, not a hole to be filled by strangers.' : 'The legal copy stays with the inquiry. Residents keep a duplicate in Nell’s shop. Silence is not sold, but the public will have to ask harder questions to find the record.';
    consequence += campaign.flags.includes('follow_audit') ? ' Dana leaves the missed-visit slip in your housing folder. You take it with you.' : ' The next visit is penciled in. You keep the appointment card beside the photograph.';
  }
  s.events.push({ sequence: s.stage + 1, ...chapter, text: `${chapter.text} ${consequence}`.trim() });
  s.stage += 1;
  return { ok: true, message: s.events.at(-1)!.text };
}
