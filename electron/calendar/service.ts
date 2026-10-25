// Calendar sources (a CalDAV server with a login): adding one checks the login
// first, the password is stored encrypted like the mail accounts'.
import { asc, eq } from 'drizzle-orm';
import { DAVClient } from 'tsdav';
import { z } from 'zod';
import type { AddCalendarResult, CalendarSource, NewCalendarSource } from '../../src/lib/api';
import type { SecretBox } from '../accounts/service';
import type { Database } from '../db';
import { calendarSources } from '../db/schema';
import { needsOAuth, serverCandidates } from './discovery';

export interface Login {
	serverUrl: string;
	username: string;
	password: string;
}

/** A logged-in CalDAV client. */
export async function connect({ serverUrl, username, password }: Login) {
	const client = new DAVClient({
		serverUrl,
		credentials: { username, password },
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
	await client.login();
	return client;
}

export type Connect = typeof connect;

const newSourceSchema = z.object({
	name: z.string().trim().max(100).optional(),
	username: z.string().trim().min(1).max(320),
	password: z.string().min(1).max(4096),
	serverUrl: z
		.string()
		.trim()
		.max(2000)
		.refine(
			(url) => url === '' || /^https?:\/\//i.test(url),
			'Die Adresse muss mit https:// beginnen.'
		)
		.optional()
});

const fields = {
	id: calendarSources.id,
	name: calendarSources.name,
	serverUrl: calendarSources.serverUrl,
	username: calendarSources.username
};

/** "401 Unauthorized" and the like count as a wrong password. */
function isAuthError(error: unknown) {
	return /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(String(error));
}

export class CalendarSources {
	constructor(
		private readonly db: Database,
		private readonly secrets: SecretBox,
		private readonly login: Connect = connect
	) {}

	list(): Promise<CalendarSource[]> {
		return this.db.select(fields).from(calendarSources).orderBy(asc(calendarSources.id));
	}

	/** Finds the server (unless given), logs in and saves the source. */
	async add(input: NewCalendarSource): Promise<AddCalendarResult> {
		const { name, username, password, serverUrl } = newSourceSchema.parse(input);
		if (!serverUrl && needsOAuth(username)) return { ok: false, reason: 'oauth' };
		const candidates = serverUrl ? [serverUrl] : serverCandidates(username);
		let authFailed = false;
		for (const candidate of candidates) {
			try {
				const client = await this.login({ serverUrl: candidate, username, password });
				// The address tsdav ended up at after discovery, to skip it next time.
				const found = client.account?.rootUrl ?? candidate;
				const [source] = await this.db
					.insert(calendarSources)
					.values({
						name: name || username,
						serverUrl: found,
						username,
						secret: await this.secrets.encrypt(password)
					})
					.returning(fields);
				return { ok: true, source };
			} catch (error) {
				authFailed ||= isAuthError(error);
			}
		}
		return { ok: false, reason: authFailed ? 'auth' : 'notfound' };
	}

	async credentials(id: number): Promise<Login | null> {
		const [row] = await this.db.select().from(calendarSources).where(eq(calendarSources.id, id));
		if (!row) return null;
		return {
			serverUrl: row.serverUrl,
			username: row.username,
			password: await this.secrets.decrypt(row.secret)
		};
	}

	async remove(id: number) {
		await this.db.delete(calendarSources).where(eq(calendarSources.id, z.number().int().parse(id)));
	}
}
