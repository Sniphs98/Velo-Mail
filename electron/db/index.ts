import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { DatabaseSync } from 'node:sqlite';

export type Database = ReturnType<typeof openDatabase>;

/**
 * Opens the database at `file` (created if missing, ':memory:' in tests) and
 * brings it up to date with the migrations in `migrationsFolder`.
 *
 * SQLite comes with Node (node:sqlite), so there is no native module to
 * rebuild for Electron.
 */
export function openDatabase(file: string, migrationsFolder: string) {
	const client = new DatabaseSync(file);
	client.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA foreign_keys = ON;
		PRAGMA busy_timeout = 5000;
	`);
	const db = drizzle({ client });
	migrate(db, { migrationsFolder });
	return db;
}
