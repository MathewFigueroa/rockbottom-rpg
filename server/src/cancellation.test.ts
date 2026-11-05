import { afterAll, expect, it, vi } from 'vitest';
import { app, persistence } from './index.js';
afterAll(() => app.close());
it('does not strand the world lock when a queued HTTP reader disconnects', async () => {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  let enter!: () => void; let release!: () => void; let queued!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; }); const waiting = new Promise<void>(resolve => { queued = resolve; });
  const originalAcquire = persistence.acquire.bind(persistence); let count = 0;
  const acquire = vi.spyOn(persistence, 'acquire').mockImplementation(async () => { count++; if (count === 2) queued(); return originalAcquire(); });
  const commit = vi.spyOn(persistence, 'commit').mockImplementationOnce(async () => { enter(); await barrier; });
  const first = fetch(`${base}/api/characters`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Owner', sex: 'female', childName: 'Riley', childAge: 8 }) });
  try {
    await entered;
    const abort = new AbortController(); const reader = fetch(`${base}/api/shards`, { signal: abort.signal }).catch(() => undefined);
    await waiting; abort.abort(); await reader; await new Promise(resolve => setTimeout(resolve, 20)); release(); expect((await first).status).toBe(201);
    expect((await fetch(`${base}/api/shards`, { signal: AbortSignal.timeout(2000) })).status).toBe(200);
  } finally { release(); acquire.mockRestore(); commit.mockRestore(); }
});
