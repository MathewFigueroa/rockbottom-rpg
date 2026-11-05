import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { MemoryStore, GameClock } from './store.js';
import { migratePostgres, PostgresRepository } from './postgres.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('real PostgreSQL persistence', () => {
  let admin: Client;
  beforeAll(async () => {
    await migratePostgres(url!); await migratePostgres(url!);
    admin = new Client({ connectionString: url }); await admin.connect();
    await admin.query('TRUNCATE rb_world_commit, rb_world');
  });
  afterAll(async () => { await admin.end(); });
  it('restores the entire world and rejects a second authoritative writer', async () => {
    const first = await PostgresRepository.connect(url!);
    try {
      expect(await first.load()).toBeUndefined();
      await expect(PostgresRepository.connect(url!)).rejects.toThrow('Another ROCKBOTTOM');
      const store = new MemoryStore(); const c = store.createCharacter({ name: 'Pg', sex: 'female', childName: 'Riley', childAge: 8 });
      store.owners.set(c.id, 'owner-hash'); c.cash = 321; c.story = { version: 1, stage: 2, path: 'army', choice: null, events: [] };
      store.clockState = new GameClock().update({ paused: true, scale: 30 });
      store.bans.set(c.id, { kind: 'communications', until: null }); store.packDisabled.add('test-pack');
      store.crews.set('crew', { id: 'crew', name: 'North', members: [c.id], allies: [], feuds: [], tags: [], reputation: 3 });
      store.cashFaucets = 317; store.chat.push({ id: 'chat', characterId: c.id, channel: 'crew', message: 'private', at: new Date().toISOString() });
      await first.save(store.snapshot(), 'integration_roundtrip');
      const restored = new MemoryStore(); restored.restore((await first.load())!);
      expect(restored.snapshot()).toEqual(store.snapshot());
    } finally { await first.close(); }
    const restarted = await PostgresRepository.connect(url!);
    try { expect((await restarted.load())?.characters[0]?.[1].cash).toBe(321); }
    finally { await restarted.close(); }
  });
  it('rolls back the world update when its commit journal fails and fails closed', async () => {
    const repo = await PostgresRepository.connect(url!); const before = (await repo.load())!;
    await admin.query("ALTER TABLE rb_world_commit ADD CONSTRAINT test_failure CHECK (reason <> 'reject_test')");
    try {
      const changed = structuredClone(before); changed.characters[0]![1].cash = 999;
      await expect(repo.save(changed, 'reject_test')).rejects.toThrow();
      expect(repo.healthy).toBe(false);
      await expect(repo.save(changed, 'retry')).rejects.toThrow('unavailable');
      expect((await admin.query('SELECT snapshot FROM rb_world')).rows[0].snapshot).toEqual(before);
      expect((await admin.query('SELECT count(*)::int AS n FROM rb_world_commit')).rows[0].n).toBe(1);
    } finally { await admin.query('ALTER TABLE rb_world_commit DROP CONSTRAINT test_failure'); await repo.close(); }
  });
  it('acknowledges HTTP commands only after durable saves and restores owner access state', async () => {
    process.env.DATABASE_URL = url;
    const { app, store } = await import('./index.js');
    try {
      const response = await app.inject({ method: 'POST', url: '/api/characters', payload: { name: 'Durable HTTP', sex: 'female', childName: 'Riley', childAge: 8 } });
      expect(response.statusCode).toBe(201);
      const id = response.json().id;
      const cookie = response.cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const action = await app.inject({ method: 'POST', url: `/api/characters/${id}/action`, headers: { cookie }, payload: { action: 'collect_recycling' } });
      expect(action.statusCode).toBe(200);
      const disk = (await admin.query('SELECT snapshot FROM rb_world')).rows[0].snapshot;
      expect(disk.characters.find(([key]: [string]) => key === id)[1].cash).toBe(22);
      expect(disk.owners.find(([key]: [string]) => key === id)[1]).toBe(store.owners.get(id));
    } finally { await app.close(); delete process.env.DATABASE_URL; }
    const restarted = await PostgresRepository.connect(url!);
    try { expect((await restarted.load())!.characters.some(([, c]) => c.name === 'Durable HTTP' && c.cash === 22)).toBe(true); }
    finally { await restarted.close(); }
  });

});
