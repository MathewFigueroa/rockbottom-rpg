-- Additive migration; existing Prisma Character/AuditEvent tables are untouched.
CREATE TABLE IF NOT EXISTS rb_world (
  id text PRIMARY KEY CHECK (id = 'halvern-1'),
  revision bigint NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL CHECK (snapshot->>'version' = '1'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rb_world_commit (
  revision bigint PRIMARY KEY,
  reason text NOT NULL,
  character_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
