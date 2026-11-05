import type { MemoryStore, ModerationCase } from './store.js';
export function reviewCase(store: MemoryStore, item: ModerationCase, decision: 'upheld' | 'overturned', notes: string, now: number) {
  if (item.status === decision) return { ok: true };
  if (item.status !== 'pending' && !notes.trim()) return { ok: false, error: 'appeal_notes_required' };
  const previous = item.status; item.status = decision; item.appealNotes = notes.slice(0, 1000); item.decidedAt = new Date(now).toISOString();
  (item.reviewHistory ??= []).push({ at: item.decidedAt, from: previous, to: decision, notes: item.appealNotes }); item.reviewHistory = item.reviewHistory.slice(-50);
  if (previous === 'upheld' && decision === 'overturned' && !item.compensated) {
    item.compensated = true; const target = store.characters.get(item.targetId); if (target) { target.grit += 5; target.actionLog.unshift({ at: item.decidedAt, action: 'appeal_upheld', detail: 'The sanction was overturned after review. Five GRIT restored; no retaliatory case is created against the reporter.' }); target.actionLog = target.actionLog.slice(0, 30); }
  }
  const upheld = store.moderationCases.filter(c => c.targetId === item.targetId && c.status === 'upheld').sort((a, b) => Date.parse(a.decidedAt ?? a.createdAt) - Date.parse(b.decidedAt ?? b.createdAt));
  store.bans.delete(item.targetId);
  upheld.forEach((c, i) => { c.flagNumber = i + 1; c.penalty = i === 0 ? 'communications' : 'game'; });
  if (upheld.length) {
    const latest = upheld.at(-1)!; const until = upheld.length >= 3 ? null : new Date(Date.parse(latest.decidedAt ?? latest.createdAt) + (upheld.length === 1 ? 3600000 : 86400000)).toISOString();
    if (!until || Date.parse(until) > now) store.bans.set(item.targetId, { kind: upheld.length === 1 ? 'communications' : 'game', until });
  }
  if (decision === 'overturned') item.penalty = 'overturned';
  return { ok: true };
}
