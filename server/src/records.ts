import type { CharacterState } from '@rockbottom/shared';
export function eligibleRecords(c: CharacterState): string[] {
  if (c.campaign?.ending) return Array.from({ length: 24 }, (_, i) => `tape-${String(i + 1).padStart(2, '0')}`);
  const p = c.campaign?.progress ?? {}; const stage = c.story?.stage ?? 0;
  const conditions = [true, !['underpass', 'tent'].includes(c.housing), c.shiftsWorked > 0, c.shelterDays >= 3, c.sobrietyDays >= 7, c.act >= 2,
    c.story?.path === 'street', (p.regulars ?? 0) >= 1, (p.regulars ?? 0) >= 3, (p['the-flip'] ?? 0) >= 1, (p['the-flip'] ?? 0) >= 2, (p['the-flip'] ?? 0) >= 3,
    c.story?.path === 'army', !!c.army?.assessment.finished || (p['the-score'] ?? 0) >= 4, (c.army?.trainingDays ?? 0) > 0 || (p['first-rotation'] ?? 0) >= 1, (c.army?.history.length ?? 0) > 0,
    (c.army?.supportPaid ?? 0) > 0, c.army?.phase === 'discharged' || (p['first-rotation'] ?? 0) >= 4, stage >= 3, stage >= 4, stage >= 5, stage >= 6, stage >= 7, stage >= 8 && (p['day-thirty'] ?? 0) >= 2];
  return conditions.flatMap((known, i) => known ? [`tape-${String(i + 1).padStart(2, '0')}`] : []);
}
export function awardRecords(c: CharacterState) { for (const id of eligibleRecords(c)) if (!c.tapes.includes(id)) c.tapes.push(id); }
