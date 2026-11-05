import { createHash } from 'node:crypto';
import type { CharacterState } from '@rockbottom/shared';
export function draw(seed: string, key: string) { return createHash('sha256').update(`${seed}:${key}`).digest().readUInt32BE(0) / 0x100000000; }
export function narrate(c: CharacterState, at: string, chapter: string, text: string, kind: 'choice' | 'consequence' | 'letter' = 'consequence', log = true) {
  const events = c.chronicle ??= [];
  const sequence = Number(events.at(-1)?.id.split(':').at(-1) ?? 0) + 1;
  events.push({ id: `${c.id}:${sequence}`, at, chapter, text, kind });
  c.chronicle = events.slice(-200);
  if (log) { c.actionLog.unshift({ at, action: chapter, detail: text }); c.actionLog = c.actionLog.slice(0, 30); }
}
export interface SystemResult { ok: boolean; message: string; minutes: number; instant?: boolean }
export const deny = (message: string): SystemResult => ({ ok: false, message, minutes: 0 });
export const done = (message: string, minutes = 1, instant = false): SystemResult => ({ ok: true, message, minutes, instant });
