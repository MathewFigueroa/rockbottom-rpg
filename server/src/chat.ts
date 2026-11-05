import { randomUUID } from 'node:crypto';
import type { MemoryStore } from './store.js';
export function chatFor(store: MemoryStore, characterId?: string) {
  return store.chat.filter(entry => entry.channel === 'proximity' || (!!characterId && (entry.characterId === characterId || (entry.channel === 'direct' && entry.recipientId === characterId) || (entry.channel === 'crew' && !!entry.crewId && !!store.crews.get(entry.crewId)?.members.includes(characterId))))).slice(-50);
}
export function sendChat(store: MemoryStore, characterId: string, body: { channel?: unknown; message?: unknown; recipientId?: unknown; crewId?: unknown }, at: string) {
  const actor = store.characters.get(characterId);
  if (!actor || actor.status === 'dead' || actor.campaign?.perspective === 'adult-child') return { ok: false as const, error: 'parent_timeline_closed' };
  const channel = body.channel ?? 'proximity';
  if (!['proximity', 'crew', 'direct'].includes(String(channel)) || typeof body.message !== 'string' || !body.message.trim()) return { ok: false as const, error: 'valid_channel_and_message_required' };
  let recipientId: string | undefined; let crewId: string | undefined;
  if (channel === 'direct') { if (typeof body.recipientId !== 'string' || !store.characters.has(body.recipientId)) return { ok: false as const, error: 'recipient_required' }; recipientId = body.recipientId; }
  if (channel === 'crew') { crewId = typeof body.crewId === 'string' ? body.crewId : [...store.crews.values()].find(c => c.members.includes(characterId))?.id; if (!crewId || !store.crews.get(crewId)?.members.includes(characterId)) return { ok: false as const, error: 'crew_membership_required' }; }
  const entry = { id: randomUUID(), characterId, channel: String(channel), message: body.message.trim().slice(0, 280), at, ...(recipientId ? { recipientId } : {}), ...(crewId ? { crewId } : {}) };
  store.chat.push(entry); store.chat.splice(0, Math.max(0, store.chat.length - 500));
  return { ok: true as const, entry };
}
