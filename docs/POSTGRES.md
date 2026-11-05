# PostgreSQL authoritative world storage

This milestone is stacked on PR #1. Set a PostgreSQL `DATABASE_URL` to select the database repository; startup fails if the database, schema or world lock is unavailable. It never silently falls back to a file. Without a PostgreSQL URL, SAVE_PATH retains the local file adapter.

The simulation still has one authoritative process. A dedicated connection holds a PostgreSQL advisory lock for its lifetime; a second process refuses to start. The `rb_world` JSONB row contains the versioned world snapshot, including credentials, runtime, clock, story, crews, bans and moderation. Each successful save atomically updates that row and appends non-sensitive revision metadata to `rb_world_commit`. This is deliberate compatibility with the existing in-memory simulation; per-character normalized tables, event sourcing and multi-shard writes are future migrations. The existing Prisma schemas are unused scaffolding and do not represent the runtime schema. The runtime uses node-postgres with parameterized SQL.

Requests and ticks serialize around storage commits. Successful commands are acknowledged only after commit. Rejected game actions still persist their failure counters. Spectators do not broadcast while a commit is in flight. A failed write restores the pre-request in-memory state, removes any newly issued owner cookie, returns an error and makes readiness fail. An ambiguous COMMIT requires a server restart to reload the actual database state; the game does not retry a possibly committed choice or casualty roll. Background clock checkpoints remain five seconds apart. The game clock is paused across process downtime rather than simulating unattended days.

## Setup and migration

Use a dedicated database and restricted service account. Keep DATABASE_URL out of logs and source control. Use provider-required TLS settings for remote deployments.

1. Set DATABASE_URL to the dedicated PostgreSQL database.
2. Run `pnpm --filter @rockbottom/server db:migrate` before starting the server. The additive migration is idempotent and serialized with a transaction advisory lock. It does not alter existing Character/AuditEvent tables.
3. Start the server. `/health` reports `persistence: postgresql` and HTTP 200 only while persistence is healthy.

Docker Compose runs the one-shot migrate service before the game server. Inside a built image the migration command is `node server/dist/migrate.js`. No generated Prisma client is required.

## Import existing file progress

Stop the old server and back up its restricted SAVE_PATH file. Migrate the empty database, then run `pnpm --filter @rockbottom/server db:import /absolute/path/world.json` with DATABASE_URL set. The importer validates the version, holds the world lock, and refuses to replace an existing database world. Start the PostgreSQL server and confirm the character IDs, owner cookie access, narrative stage and clock. Keep the original backup until that check is complete.

## Back up and restore

Use PostgreSQL-native `pg_dump` in custom format and `pg_restore` into a fresh dedicated database. For a consistent cutover, stop the game process first; PostgreSQL snapshots are consistent even when a backup is taken online. Backups contain private credentials and moderation evidence: encrypt them, restrict access, and apply a retention policy.

Restore into a fresh database, apply the idempotent migration, and start exactly one server against it. Check /health, owner access, agent access and campaign state before switching traffic. Never restore only one of the two runtime tables: the world revision and commit journal must agree. Rollback means switching back to the untouched previous database or file backup while all game writers are stopped; it does not mean downgrading a live schema.

## Verification and limits

`TEST_DATABASE_URL=... pnpm exec vitest run server/src/postgres.test.ts` runs against an isolated disposable database. It truncates the two runtime tables and exercises migration reruns, complete state roundtrips, restart, writer exclusion, transactional rollback and fail-closed behavior. CI uses PostgreSQL 16; local verification also uses a real PostgreSQL process. HTTP storage-failure tests verify rollback, cookie suppression and readiness failure.

The snapshot model has write amplification and is intended for the existing single 64-player shard. Journal retention/compaction, point-in-time recovery operations, normalized query indexes, online migration tooling, credential encryption/rotation and shared-state sharding remain separate milestones. Do not share the test database with a live world.
