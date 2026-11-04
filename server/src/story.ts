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
] as const;
export function storyState(c: CharacterState): StoryState { return c.story ??= { version: 1, stage: 0, path: null, choice: null, events: [] }; }
export function storyView(c: CharacterState) { const s = storyState(c); return { ...s, prompt: STORY_PROMPTS[s.stage], availableChoices: choices(c) }; }
export function choices(c: CharacterState): string[] {
  const s = storyState(c);
  if (c.act < 2) return [];
  return [...(STORY_CHOICES[s.stage] ?? [])];
}
export function advanceStory(c: CharacterState, choice: unknown): { ok: boolean; message: string } {
  const s = storyState(c);
  if (typeof choice !== 'string' || !choices(c).includes(choice)) return { ok: false, message: 'Choose an available story decision after the first visitation.' };
  const chapter = CHAPTERS[s.stage]!;
  let consequence = '';
  if (choice === 'street' || choice === 'army') {
    s.path = choice;
    c.location = choice === 'street' ? 'Okafor Pawn & Repair' : 'Fort Halvern Annex';
    consequence = choice === 'street' ? 'Nell offers local trust and irregular work. You will trace the duplicate through the repair shops.' : 'Vale offers supervised logistics duty, regular pay and an obligation to document orders. You will trace the duplicate through the annex archive.';
  }
  if (choice === 'verify_copy') { c.inventory.push('verified-ledger'); consequence = s.path === 'army' ? 'Vale signs a chain-of-custody receipt, risking her promotion.' : 'Nell brings two tenants to authenticate the addresses, risking their anonymity.'; }
  if (choice === 'save_neighbors' || choice === 'secure_ledger') {
    s.choice = choice;
    if (choice === 'save_neighbors') { c.needs.energy = Math.max(0, c.needs.energy - 15); c.grit += 8; c.inventory = c.inventory.filter(i => i !== 'verified-ledger'); consequence = 'You carry six residents out. The original leaves town. Your case now rests on witnesses who can refuse to testify.'; }
    else { c.heat += 12; consequence = 'You secure the original. Nell evacuates the house without you; Sam injures his hand carrying the last resident. He will recover. He will remember.'; }
  }
  if (choice === 'publish_names' || choice === 'protect_witnesses') {
    c.act = 3;
    consequence = choice === 'publish_names' ? 'The inquiry can compel an audit, but the witness addresses become public. Dana asks whose safety you counted as a cost.' : 'A sealed affidavit preserves witness privacy. The audit will take longer. Vale agrees to testify under her own name.';
    consequence += s.choice === 'save_neighbors' ? ' The rescued residents choose to attend. Their presence is evidence you could not seize.' : ' Sam sends the uncut recording. His note says: a record can be repaired; trust takes longer.';
    consequence += ' Your child asks whether you will come on Tuesday. You promise only Tuesday. Custody still depends on housing, visits and sustained care.';
  }
  s.events.push({ sequence: s.stage + 1, ...chapter, text: `${chapter.text} ${consequence}`.trim() });
  s.stage += 1;
  return { ok: true, message: s.events.at(-1)!.text };
}
