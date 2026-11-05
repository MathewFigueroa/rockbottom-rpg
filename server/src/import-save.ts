import { readFile } from 'node:fs/promises';
import { MemoryStore, type WorldSnapshot } from './store.js';
import { PostgresRepository } from './postgres.js';
if (!process.env.DATABASE_URL || !process.argv[2]) throw new Error('Usage: DATABASE_URL=... tsx src/import-save.ts path/to/world.json');
const repository = await PostgresRepository.connect(process.env.DATABASE_URL);
try {
  if (await repository.load()) throw new Error('Refusing to overwrite a nonempty PostgreSQL world');
  const store = new MemoryStore(); store.restore(JSON.parse(await readFile(process.argv[2], 'utf8')) as WorldSnapshot);
  await repository.save(store.snapshot(), 'import_file_save');
  console.log('Imported world into empty PostgreSQL database');
} finally { await repository.close(); }
