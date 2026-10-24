import { describe, expect, it } from 'vitest';
import type { ServerSettings } from '../../src/lib/api';
import { classify, imapOptions, smtpOptions } from './connection';

const settings: ServerSettings = {
	imapHost: 'imap.beispiel.de',
	imapPort: 993,
	imapSecurity: 'tls',
	smtpHost: 'smtp.beispiel.de',
	smtpPort: 587,
	smtpSecurity: 'starttls',
	username: 'du@beispiel.de'
};

describe('connection options', () => {
	it('maps the security setting onto the clients', () => {
		expect(imapOptions(settings, 'pw')).toMatchObject({ secure: true, doSTARTTLS: undefined });
		expect(imapOptions({ ...settings, imapSecurity: 'starttls' }, 'pw')).toMatchObject({
			secure: false,
			doSTARTTLS: true
		});
		expect(imapOptions({ ...settings, imapSecurity: 'none' }, 'pw')).toMatchObject({
			secure: false,
			doSTARTTLS: false
		});
		expect(smtpOptions(settings, 'pw')).toMatchObject({ secure: false, requireTLS: true });
		expect(smtpOptions({ ...settings, smtpSecurity: 'tls' }, 'pw')).toMatchObject({
			secure: true,
			requireTLS: false
		});
		expect(smtpOptions({ ...settings, smtpSecurity: 'none' }, 'pw')).toMatchObject({
			secure: false,
			ignoreTLS: true
		});
	});
});

describe('classify', () => {
	it('sorts errors into what the UI explains', () => {
		expect(classify({ authenticationFailed: true })).toBe('auth');
		expect(classify({ code: 'EAUTH' })).toBe('auth');
		expect(classify({ code: 'ENOTFOUND' })).toBe('host');
		expect(classify({ code: 'ECONNREFUSED' })).toBe('host');
		expect(classify({ code: 'ESOCKET', message: 'connect ECONNREFUSED 127.0.0.1:1' })).toBe('host');
		expect(classify({ code: 'CONNECT_TIMEOUT' })).toBe('timeout');
		expect(classify({ code: 'ETIMEDOUT' })).toBe('timeout');
		expect(classify({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' })).toBe('tls');
		expect(classify({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).toBe('tls');
		expect(classify(new Error('Server does not support STARTTLS'))).toBe('tls');
		expect(classify(new Error('something else'))).toBe('other');
		expect(classify(undefined)).toBe('other');
	});
});
