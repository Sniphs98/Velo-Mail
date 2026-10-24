import { describe, expect, it } from 'vitest';
import { greenMail } from '../../scripts/greenmail.mjs';
import type { ServerSettings } from '../../src/lib/api';
import { testConnection } from './connection';

// GreenMail runs without TLS, see scripts/greenmail.mjs.
const settings: ServerSettings = {
	imapHost: greenMail.host,
	imapPort: greenMail.imapPort,
	imapSecurity: 'none',
	smtpHost: greenMail.host,
	smtpPort: greenMail.smtpPort,
	smtpSecurity: 'none',
	username: greenMail.user.email
};

describe('testConnection against GreenMail', () => {
	it('logs in to IMAP and SMTP', async () => {
		expect(await testConnection(settings, greenMail.user.password)).toEqual({
			imap: { ok: true },
			smtp: { ok: true }
		});
	});

	it('reports a wrong password', async () => {
		const result = await testConnection(settings, 'falsch');
		expect(result.imap).toMatchObject({ ok: false, error: 'auth' });
		expect(result.smtp).toMatchObject({ ok: false, error: 'auth' });
	});

	it('reports a closed port', async () => {
		const result = await testConnection({ ...settings, imapPort: 1, smtpPort: 1 }, 'x');
		expect(result.imap).toMatchObject({ ok: false, error: 'host' });
		expect(result.smtp).toMatchObject({ ok: false, error: 'host' });
	});

	it('refuses to log in unencrypted when STARTTLS is required', async () => {
		const result = await testConnection(
			{ ...settings, imapSecurity: 'starttls', smtpSecurity: 'starttls' },
			greenMail.user.password
		);
		expect(result.imap).toMatchObject({ ok: false, error: 'tls' });
		expect(result.smtp).toMatchObject({ ok: false, error: 'tls' });
	});
});
