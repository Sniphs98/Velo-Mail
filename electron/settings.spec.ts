import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { settings } from './db/schema';
import { defaultSettings, readSettings, writeSettings } from './settings';

const open = () => openDatabase(':memory:', path.resolve('drizzle'));

describe('settings', () => {
	it('starts with the defaults', async () => {
		expect(await readSettings(open())).toEqual(defaultSettings);
	});

	it('saves changes and keeps the rest', async () => {
		const db = open();
		expect(await writeSettings(db, { theme: 'dark' })).toEqual({
			...defaultSettings,
			theme: 'dark'
		});
		await writeSettings(db, { notifications: false });
		expect(await readSettings(db)).toEqual({
			...defaultSettings,
			theme: 'dark',
			notifications: false
		});
	});

	it('rejects unknown keys and wrong values', async () => {
		const db = open();
		await expect(writeSettings(db, { theme: 'pink' })).rejects.toThrow();
		await expect(writeSettings(db, { font: 'Comic Sans' })).rejects.toThrow();
		expect(await readSettings(db)).toEqual(defaultSettings);
	});

	it('ignores invalid stored values', async () => {
		const db = open();
		await db.insert(settings).values([
			{ key: 'theme', value: 'pink' },
			{ key: 'removed', value: 1 }
		]);
		expect(await readSettings(db)).toEqual(defaultSettings);
	});
});
