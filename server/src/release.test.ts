import { expect, it, afterAll } from 'vitest';
import { MemoryStore } from './store.js';
import { reviewCase } from './moderation.js';
import { chatFor, sendChat } from './chat.js';
import { app, store } from './index.js';
afterAll(() => app.close());
const input = { name: 'Alex', sex: 'female' as const, childName: 'Riley', childAge: 8 };
it('keeps direct/crew messages out of public chat and unrelated agents', () => {
  const s = new MemoryStore(); const a = s.createCharacter(input); const b = s.createCharacter(input); const stranger = s.createCharacter(input);
  s.crews.set('crew', { id: 'crew', name: 'North', members: [a.id, b.id], allies: [], feuds: [], tags: [], reputation: 0 });
  expect(sendChat(s, a.id, { channel: 'direct', recipientId: b.id, message: 'Private direct' }, '').ok).toBe(true);
  expect(sendChat(s, a.id, { channel: 'crew', crewId: 'crew', message: 'Private crew' }, '').ok).toBe(true);
  expect(sendChat(s, stranger.id, { channel: 'crew', crewId: 'crew', message: 'forged' }, '').ok).toBe(false);
  expect(chatFor(s)).toEqual([]); expect(chatFor(s, stranger.id)).toEqual([]); expect(chatFor(s, b.id)).toHaveLength(2);
  expect(sendChat(s, a.id, { channel: 'direct', message: 'no receiver' }, '').ok).toBe(false);
});
it('upholds evidence, handles appeals, recomputes sanctions and compensates once without retaliatory flags', () => {
  const s = new MemoryStore(); const c = s.createCharacter(input); const now = Date.now();
  const first = { id: 'one', reporterId: 'r', targetId: c.id, reason: 'report', evidence: { audioClip: '', chat: [], fingerprintHash: '' }, status: 'pending' as const, flagNumber: 1, penalty: 'pending', appealNotes: '', createdAt: new Date(now).toISOString() };
  const second = { ...first, id: 'two' }; s.moderationCases.push(first, second);
  reviewCase(s, first, 'upheld', 'Evidence upheld', now); expect(s.bans.get(c.id)?.kind).toBe('communications');
  reviewCase(s, second, 'upheld', 'Evidence upheld', now + 1000); expect(s.bans.get(c.id)?.kind).toBe('game');
  expect(reviewCase(s, second, 'overturned', '', now + 2000).ok).toBe(false);
  reviewCase(s, second, 'overturned', 'Independent evidence clears this report', now + 2000); expect(s.bans.get(c.id)?.kind).toBe('communications'); expect(c.grit).toBe(5);
  reviewCase(s, second, 'overturned', 'Duplicate request', now + 3000); expect(c.grit).toBe(5); expect(s.moderationCases).toHaveLength(2);
  reviewCase(s, first, 'overturned', 'Also cleared', now + 4000); expect(s.bans.has(c.id)).toBe(false);
});
it('returns a report receipt without disclosing the target’s private moderation evidence', async () => {
  const created = await app.inject({ method: 'POST', url: '/api/characters', payload: input }); const reporter = created.json(); const cookie = created.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const target = store.createCharacter(input); sendChat(store, target.id, { channel: 'direct', recipientId: target.id, message: 'PRIVATE EVIDENCE' }, new Date().toISOString());
  const response = await app.inject({ method: 'POST', url: '/api/reports', headers: { cookie }, payload: { reporterId: reporter.id, targetId: target.id, reason: 'review', fingerprint: 'untrusted-data' } });
  expect(response.statusCode).toBe(201); expect(response.json().status).toBe('pending'); expect(response.body).not.toContain('PRIVATE EVIDENCE'); expect(response.json().evidence).toBeUndefined(); expect(store.bans.has(target.id)).toBe(false);
});
it('recovers owner access with a hashed recovery code and rotates agent credentials without losing progress', async () => {
  const created = await app.inject({ method: 'POST', url: '/api/characters', payload: input }); const c = created.json(); const cookie = created.cookies.map(x => `${x.name}=${x.value}`).join('; ');
  const issued = await app.inject({ method: 'POST', url: `/api/characters/${c.id}/recovery-code`, headers: { cookie }, payload: {} }); const code = issued.json().recoveryCode;
  expect(store.ownerRecovery.get(c.id)).not.toBe(code);
  expect((await app.inject({ method: 'POST', url: '/api/recover', payload: { id: c.id, recoveryCode: 'wrong' } })).statusCode).toBe(401);
  const recovered = await app.inject({ method: 'POST', url: '/api/recover', payload: { id: c.id, recoveryCode: code } }); const newCookie = recovered.cookies.map(x => `${x.name}=${x.value}`).join('; ');
  expect(recovered.statusCode).toBe(200); expect((await app.inject({ url: `/api/characters/${c.id}`, headers: { cookie } })).statusCode).toBe(401);
  expect((await app.inject({ url: `/api/characters/${c.id}`, headers: { cookie: newCookie } })).statusCode).toBe(200);
  const rotated = await app.inject({ method: 'POST', url: `/api/characters/${c.id}/agent-token`, headers: { cookie: newCookie }, payload: {} }); expect(rotated.json().agentToken).not.toBe(c.agentToken);
  expect((await app.inject({ method: 'POST', url: '/api/agent/observe', headers: { authorization: `Bearer ${c.agentToken}` } })).statusCode).toBe(401);
  expect((await app.inject({ method: 'POST', url: '/api/agent/observe', headers: { authorization: `Bearer ${rotated.json().agentToken}` } })).statusCode).toBe(200);
  const restored = new MemoryStore(); restored.restore(store.snapshot()); expect(restored.ownerRecovery.get(c.id)).toBe(store.ownerRecovery.get(c.id)); expect(restored.characters.get(c.id)?.cash).toBe(4);
});
