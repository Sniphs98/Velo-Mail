import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ConnectionResult, NewAccount } from '../../src/lib/api';
import { openDatabase, type Database } from '../db';
import { accounts } from '../db/schema';
import { AccountService, accountColors, type SecretBox } from './service';

// Reversible, and visibly not the plain text.
const secrets: SecretBox = {
	encrypt: async (plain) => Buffer.from(plain).reverse(),
	decrypt: async (encrypted) => Buffer.from(encrypted).reverse().toString()
};

const ok: ConnectionResult = { imap: { ok: true }, smtp: { ok: true } };

const input = (email: string): NewAccount => ({
	name: 'Persönlich',
	email,
	password: 'geheim',
	settings: {
		imapHost: 'imap.beispiel.de',
		imapPort: 993,
		imapSecurity: 'tls',
		smtpHost: 'smtp.beispiel.de',
		smtpPort: 465,
		smtpSecurity: 'tls',
		username: email
	}
});

describe('AccountService', () => {
	let db: Database;
	let result: ConnectionResult;
	let tested: { settings: NewAccount['settings']; password: string }[];
	let service: AccountService;

	beforeEach(() => {
		db = openDatabase(':memory:', path.resolve('drizzle'));
		result = ok;
		tested = [];
		service = new AccountService(db, secrets, async (settings, password) => {
			tested.push({ settings, password });
			return result;
		});
	});

	it('saves an account after a successful login, with the password encrypted', async () => {
		const added = await service.add(input('Du@Beispiel.de'));
		expect(added).toEqual({
			ok: true,
			account: {
				id: 1,
				name: 'Persönlich',
				email: 'du@beispiel.de',
				color: accountColors[0],
				signature: '',
				notify: 'all'
			}
		});
		expect(tested).toHaveLength(1);

		const [row] = await db.select().from(accounts);
		expect(row.secret?.toString()).not.toContain('geheim');
		expect(await secrets.decrypt(row.secret!)).toBe('geheim');
		expect(row.imapHost).toBe('imap.beispiel.de');
	});

	it('gives each account the next color and keeps their order', async () => {
		await service.add(input('a@beispiel.de'));
		await service.add(input('b@beispiel.de'));
		expect(await service.list()).toMatchObject([
			{ email: 'a@beispiel.de', color: accountColors[0] },
			{ email: 'b@beispiel.de', color: accountColors[1] }
		]);
	});

	it('refuses the same address twice without testing again', async () => {
		await service.add(input('du@beispiel.de'));
		expect(await service.add(input('DU@beispiel.de'))).toEqual({ ok: false, reason: 'exists' });
		expect(tested).toHaveLength(1);
	});

	it('saves nothing when a server rejects the login', async () => {
		result = {
			imap: { ok: true },
			smtp: { ok: false, error: 'auth', detail: '535 Authentication failed' }
		};
		expect(await service.add(input('du@beispiel.de'))).toEqual({
			ok: false,
			reason: 'connection',
			connection: result
		});
		expect(await service.list()).toEqual([]);
	});

	it('rejects invalid input before connecting', async () => {
		await expect(service.add({ ...input('kein-at-zeichen'), name: 'X' })).rejects.toThrow();
		await expect(
			service.add({ ...input('du@beispiel.de'), settings: { ...input('').settings, imapPort: 0 } })
		).rejects.toThrow();
		await expect(service.add({ ...input('du@beispiel.de'), password: '' })).rejects.toThrow();
		expect(tested).toEqual([]);
	});

	it('hands out the settings and the decrypted password for connecting', async () => {
		await service.add(input('du@beispiel.de'));
		expect(await service.credentials(1)).toEqual({
			name: 'Persönlich',
			email: 'du@beispiel.de',
			settings: input('du@beispiel.de').settings,
			password: 'geheim'
		});
		expect(await service.credentials(99)).toBeNull();
	});

	it('changes the color and the notifications, only to real values', async () => {
		await service.add(input('du@beispiel.de'));
		expect(await service.update(1, { color: '#16a34a' })).toMatchObject({ color: '#16a34a' });
		await expect(service.update(1, { color: 'red; background: url(x)' })).rejects.toThrow();
		expect(await service.update(1, { notify: 'important' })).toMatchObject({ notify: 'important' });
		await expect(service.update(1, { notify: 'sometimes' as 'all' })).rejects.toThrow();
	});

	it('changes the name and the signature', async () => {
		await service.add(input('du@beispiel.de'));
		expect(await service.update(1, { signature: 'Grüße\nDu' })).toMatchObject({
			name: 'Persönlich',
			signature: 'Grüße\nDu'
		});
		expect(await service.update(1, { name: ' Privat ' })).toMatchObject({
			name: 'Privat',
			signature: 'Grüße\nDu'
		});
		expect((await service.credentials(1))?.name).toBe('Privat');
		await expect(service.update(1, { name: '' })).rejects.toThrow();
		await expect(service.update(1, { email: 'x@y.de' } as never)).rejects.toThrow();
		await expect(service.update(2, { name: 'Weg' })).rejects.toThrow('gibt es nicht mehr');
	});

	it('removes an account', async () => {
		await service.add(input('du@beispiel.de'));
		await service.remove(1);
		expect(await service.list()).toEqual([]);
	});
});
