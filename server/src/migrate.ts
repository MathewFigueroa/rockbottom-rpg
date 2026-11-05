import { migratePostgres } from './postgres.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
await migratePostgres(process.env.DATABASE_URL);
console.log('ROCKBOTTOM PostgreSQL migrations applied');
