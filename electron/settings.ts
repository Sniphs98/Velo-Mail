// App settings, stored one key per row so new settings need no migration.
// Unknown or invalid stored values fall back to the defaults.
import { z } from 'zod';
import type { Settings } from '../src/lib/api';
import type { Database } from './db';
import { settings } from './db/schema';

export const settingsSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
	notifications: z.boolean(),
	tray: z.boolean()
});

export const defaultSettings: Settings = { theme: 'system', notifications: true, tray: false };

export async function readSettings(db: Database): Promise<Settings> {
	const result: Settings = { ...defaultSettings };
	for (const row of await db.select().from(settings)) {
		const key = row.key as keyof Settings;
		const parsed = settingsSchema.shape[key]?.safeParse(row.value);
		if (parsed?.success) Object.assign(result, { [key]: parsed.data });
	}
	return result;
}

/** Validates and saves the given settings; returns all of them. */
export async function writeSettings(db: Database, changes: unknown): Promise<Settings> {
	const valid = settingsSchema.partial().strict().parse(changes);
	for (const [key, value] of Object.entries(valid)) {
		await db
			.insert(settings)
			.values({ key, value })
			.onConflictDoUpdate({ target: settings.key, set: { value } });
	}
	return readSettings(db);
}
