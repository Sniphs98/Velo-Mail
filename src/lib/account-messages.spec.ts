import { describe, expect, it } from 'vitest';
import { connectionMessages, ipcErrorMessage, rejectedLogin } from './account-messages';

describe('connectionMessages', () => {
	it('explains each server that failed', () => {
		const result = {
			imap: { ok: false, error: 'auth', detail: 'NO' },
			smtp: { ok: false, error: 'other', detail: 'Unexpected greeting' }
		} as const;
		expect(connectionMessages(result)).toEqual([
			'Empfang (IMAP): Benutzername oder Passwort wurden abgelehnt.',
			'Versand (SMTP): Die Verbindung ist fehlgeschlagen. (Unexpected greeting)'
		]);
		expect(rejectedLogin(result)).toBe(true);
	});

	it('says nothing when both servers worked', () => {
		const result = { imap: { ok: true }, smtp: { ok: true } } as const;
		expect(connectionMessages(result)).toEqual([]);
		expect(rejectedLogin(result)).toBe(false);
	});
});

describe('ipcErrorMessage', () => {
	it("drops Electron's prefix", () => {
		expect(
			ipcErrorMessage(
				new Error("Error invoking remote method 'accounts:add': Error: Kein Schlüsselspeicher")
			)
		).toBe('Kein Schlüsselspeicher');
		expect(ipcErrorMessage(new Error('plain'))).toBe('plain');
	});
});
