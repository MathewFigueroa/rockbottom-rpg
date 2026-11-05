import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import type { WorldSnapshot } from './store.js';

/** One authoritative simulation per database, enforced by a session advisory lock. */
export class PostgresRepository {
  private revision = 0;
  healthy = true;
  private constructor(private readonly client: Client) {
    client.on('error', () => { this.healthy = false; });
  }
  static async connect(url: string) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    const repository = new PostgresRepository(client);
    try {
      await client.connect();
      const lock = await client.query('SELECT pg_try_advisory_lock(726225, 1) AS acquired');
      if (!lock.rows[0].acquired) throw new Error('Another ROCKBOTTOM server owns this world');
      // Migrations run explicitly, never silently at game startup.
      await client.query('SELECT revision FROM rb_world LIMIT 0');
      return repository;
    } catch (error) { await client.end(); throw error; }
  }
  async load(): Promise<WorldSnapshot | undefined> {
    const result = await this.client.query('SELECT revision, snapshot FROM rb_world WHERE id = $1', ['halvern-1']);
    this.revision = Number(result.rows[0]?.revision ?? 0);
    return result.rows[0]?.snapshot;
  }
  async save(snapshot: WorldSnapshot, reason: string) {
    if (!this.healthy) throw new Error('PostgreSQL persistence unavailable; restart after recovery');
    const next = this.revision + 1;
    try {
      await this.client.query('BEGIN');
      const result = await this.client.query(`INSERT INTO rb_world(id, revision, snapshot) VALUES ('halvern-1', $1, $2::jsonb)
        ON CONFLICT(id) DO UPDATE SET revision = EXCLUDED.revision, snapshot = EXCLUDED.snapshot, updated_at = now()
        WHERE rb_world.revision = $3 RETURNING revision`, [next, JSON.stringify(snapshot), this.revision]);
      if (result.rowCount !== 1) throw new Error('World revision conflict');
      await this.client.query('INSERT INTO rb_world_commit(revision, reason, character_count) VALUES ($1, $2, $3)', [next, reason.slice(0, 120), snapshot.characters.length]);
      await this.client.query('COMMIT');
      this.revision = next;
    } catch (error) {
      // A disconnected COMMIT is ambiguous. Stop serving state rather than guessing or rerolling.
      this.healthy = false;
      await this.client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }
  async close() { await this.client.end(); }
}

export async function migratePostgres(url: string) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(726225, 2)');
    await client.query(await readFile(new URL('../migrations/001_world.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
