import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { ConnectionError, ConnectionResult, ServerSettings } from '../../src/lib/api';

const timeout = 15_000;

/** IMAP client options; "starttls" refuses to continue unencrypted. */
export function imapOptions(settings: ServerSettings, password: string): ImapFlowOptions {
	return {
		host: settings.imapHost,
		port: settings.imapPort,
		secure: settings.imapSecurity === 'tls',
		doSTARTTLS: settings.imapSecurity === 'tls' ? undefined : settings.imapSecurity === 'starttls',
		auth: { user: settings.username, pass: password },
		connectionTimeout: timeout,
		greetingTimeout: timeout,
		socketTimeout: timeout,
		logger: false
	};
}

/** SMTP transport options; "starttls" refuses to continue unencrypted. */
export function smtpOptions(settings: ServerSettings, password: string): SMTPTransport.Options {
	return {
		host: settings.smtpHost,
		port: settings.smtpPort,
		secure: settings.smtpSecurity === 'tls',
		requireTLS: settings.smtpSecurity === 'starttls',
		ignoreTLS: settings.smtpSecurity === 'none',
		auth: { user: settings.username, pass: password },
		connectionTimeout: timeout,
		greetingTimeout: timeout,
		socketTimeout: timeout
	};
}

/** Logs in to both servers and logs out again; nothing is saved. */
export async function testConnection(
	settings: ServerSettings,
	password: string
): Promise<ConnectionResult> {
	const [imap, smtp] = await Promise.all([
		attempt(async () => {
			const client = new ImapFlow(imapOptions(settings, password));
			// Errors after connect() arrive as events; the result comes from connect().
			client.on('error', () => {});
			await client.connect();
			await client.logout();
		}),
		attempt(async () => {
			const transport = nodemailer.createTransport(smtpOptions(settings, password));
			try {
				await transport.verify();
			} finally {
				transport.close();
			}
		})
	]);
	return { imap, smtp };
}

async function attempt(run: () => Promise<void>): Promise<ConnectionResult['imap']> {
	try {
		await run();
		return { ok: true };
	} catch (error) {
		return { ok: false, error: classify(error), detail: describe(error) };
	}
}

interface MailError {
	code?: string;
	authenticationFailed?: boolean;
	responseCode?: number;
	message?: string;
}

/** Sorts imapflow, nodemailer and socket errors into what the UI explains. */
export function classify(error: unknown): ConnectionError {
	const e = (error ?? {}) as MailError;
	const code = e.code ?? '';
	if (e.authenticationFailed || code === 'EAUTH' || code === 'ENOAUTH' || e.responseCode === 535)
		return 'auth';
	const hostCodes = ['ENOTFOUND', 'EAI_AGAIN', 'EDNS', 'ECONNREFUSED', 'EHOSTUNREACH'];
	// nodemailer wraps socket errors as ESOCKET and keeps the cause in the message.
	if (hostCodes.includes(code) || hostCodes.some((c) => e.message?.includes(c))) return 'host';
	if (
		['ETIMEDOUT', 'ETIMEOUT', 'CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(
			code
		)
	)
		return 'timeout';
	if (
		code === 'ETLS' ||
		code === 'STARTTLS_INJECTION' ||
		code.startsWith('ERR_TLS') ||
		/CERT/.test(code)
	)
		return 'tls';
	if (/certificate|self[- ]signed|tls/i.test(e.message ?? '')) return 'tls';
	return 'other';
}

function describe(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
