import type { ConnectionError, ConnectionResult } from '#lib/api.ts';

const reasons: Record<ConnectionError, string> = {
	auth: 'Benutzername oder Passwort wurden abgelehnt.',
	host: 'Der Server ist nicht erreichbar. Stimmen Adresse und Port?',
	timeout: 'Der Server antwortet nicht.',
	tls: 'Die verschlüsselte Verbindung ist fehlgeschlagen.',
	other: 'Die Verbindung ist fehlgeschlagen.'
};

/** One line per server that failed, e.g. "Empfang (IMAP): Der Server antwortet nicht." */
export function connectionMessages(result: ConnectionResult): string[] {
	const lines: string[] = [];
	for (const [label, server] of [
		['Empfang (IMAP)', result.imap],
		['Versand (SMTP)', result.smtp]
	] as const) {
		if (server.ok) continue;
		const detail = server.error === 'other' ? ` (${server.detail})` : '';
		lines.push(`${label}: ${reasons[server.error]}${detail}`);
	}
	return lines;
}

/** True if a login was rejected, where an app password is the usual fix. */
export function rejectedLogin(result: ConnectionResult): boolean {
	return [result.imap, result.smtp].some((server) => !server.ok && server.error === 'auth');
}

/** The message of an error thrown in the main process, without Electron's IPC prefix. */
export function ipcErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}
