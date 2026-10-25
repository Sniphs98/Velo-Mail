import { m } from '#lib/paraglide/messages.js';
import type { ConnectionError, ConnectionResult } from '#lib/api.ts';

const reasons: Record<ConnectionError, () => string> = {
	auth: m.connection_auth,
	host: m.connection_host,
	timeout: m.connection_timeout,
	tls: m.connection_tls,
	other: m.connection_other
};

/** One line per server that failed, e.g. "Incoming (IMAP): The server does not answer." */
export function connectionMessages(result: ConnectionResult): string[] {
	const lines: string[] = [];
	for (const [label, server] of [
		[m.server_incoming(), result.imap],
		[m.server_outgoing(), result.smtp]
	] as const) {
		if (server.ok) continue;
		const detail = server.error === 'other' ? ` (${server.detail})` : '';
		lines.push(`${label}: ${reasons[server.error]()}${detail}`);
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
