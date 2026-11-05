import { afterAll, expect, it, vi } from 'vitest';
import { app, store } from './index.js';
import { PersistenceCoordinator } from './persistence.js';
import { GameClock, MemoryStore } from './store.js';
afterAll(() => app.close());
it('serializes writes without leaking an uncommitted intermediate state', async () => {
  const gate = new PersistenceCoordinator(new MemoryStore(), new GameClock());
  const release = await gate.acquire(); let entered = false;
  const second = gate.acquire().then(unlock => { entered = true; unlock(); });
  await Promise.resolve(); expect(entered).toBe(false); expect(gate.busy).toBe(true);
  release(); await second; expect(entered).toBe(true); expect(gate.busy).toBe(false);
});
it('rolls back failed creation, sends no cookie, and refuses further requests', async () => {
  const before = store.snapshot();
  vi.spyOn(store, 'save').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
  const response = await app.inject({ method: 'POST', url: '/api/characters', payload: { name: 'Lost', sex: 'female', childName: 'Riley', childAge: 8 } });
  expect(response.statusCode).toBe(500); expect(response.cookies).toHaveLength(0);
  expect(store.characters.size).toBe(before.characters.length);
  expect(store.owners.size).toBe(before.owners.length);
  expect((await app.inject({ url: '/health' })).statusCode).toBe(503);
  expect((await app.inject({ url: '/api/shards' })).statusCode).toBe(503);
});
