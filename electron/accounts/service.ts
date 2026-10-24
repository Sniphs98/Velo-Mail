import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type {
	Account,
	AccountChanges,
	AddAccountResult,
	ConnectionResult,
	NewAccount,
	ServerSettings
} from '../../src/lib/api';
import type { Database } from '../db';
import { accounts } from '../db/schema';

/** Encrypts secrets at rest; safeStorage in the app, a stand-in in tests. */
export interface SecretBox {
	encrypt(plain: string): Promise<Buffer>;
	decrypt(encrypted: Buffer): Promise<string>;
}

export interface Credentials {
	name: string;
	email: string;
	settings: ServerSettings;
	password: string;
}

/** Account colors, assigned in turn (design: blue, orange, teal, …). */
export const accountColors = ['#2563eb', '#ea580c', '#0d9488', '#7c3aed', '#db2777', '#ca8a04'];

const security = z.enum(['tls', 'starttls', 'none']);
const host = z.string().trim().min(1).max(253);
const port = z.number().int().min(1).max(65535);

export const serverSettingsSchema = z.object({
	imapHost: host,
	imapPort: port,
	imapSecurity: security,
	smtpHost: host,
	smtpPort: port,
	smtpSecurity: security,
	username: z.string().trim().min(1).max(320)
});

export const accountChangesSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		signature: z.string().max(10_000)
	})
	.partial()
	.strict();

export const newAccountSchema = z.object({
	name: z.string().trim().min(1).max(100),
	email: z.email().max(320),
	password: z.string().min(1).max(4096),
	settings: serverSettingsSchema
});

const accountFields = {
	id: accounts.id,
	name: accounts.name,
	email: accounts.email,
	color: accounts.color,
	signature: accounts.signature
};

export class AccountService {
	constructor(
		private readonly db: Database,
		private readonly secrets: SecretBox,
		private readonly test: (
			settings: NewAccount['settings'],
			password: string
		) => Promise<ConnectionResult>
	) {}

	async list(): Promise<Account[]> {
		return this.db
			.select(accountFields)
			.from(accounts)
			.orderBy(asc(accounts.position), asc(accounts.id));
	}

	/** Saves the account only if both servers accept the login. */
	async add(input: NewAccount): Promise<AddAccountResult> {
		const { name, email, password, settings } = newAccountSchema.parse(input);
		const address = email.toLowerCase();

		const existing = await this.db
			.select({ id: accounts.id })
			.from(accounts)
			.where(eq(accounts.email, address));
		if (existing.length > 0) return { ok: false, reason: 'exists' };

		const connection = await this.test(settings, password);
		if (!connection.imap.ok || !connection.smtp.ok) {
			return { ok: false, reason: 'connection', connection };
		}

		const count = (await this.list()).length;
		const [account] = await this.db
			.insert(accounts)
			.values({
				name,
				email: address,
				color: accountColors[count % accountColors.length],
				position: count,
				...settings,
				secret: await this.secrets.encrypt(password)
			})
			.returning(accountFields);
		return { ok: true, account };
	}

	/** Changes the name (shown as the sender) or the signature. */
	async update(id: number, input: AccountChanges): Promise<Account> {
		const changes = accountChangesSchema.parse(input);
		const [account] = await this.db
			.update(accounts)
			.set(changes)
			.where(eq(accounts.id, z.number().int().parse(id)))
			.returning(accountFields);
		if (!account) throw new Error('Das Konto gibt es nicht mehr.');
		return account;
	}

	/** Server settings and decrypted password, for connecting and sending. */
	async credentials(id: number): Promise<Credentials | null> {
		const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
		if (!row?.secret) return null;
		const { imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, username } = row;
		return {
			name: row.name,
			email: row.email,
			settings: { imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, username },
			password: await this.secrets.decrypt(row.secret)
		};
	}

	async remove(id: number): Promise<void> {
		await this.db.delete(accounts).where(eq(accounts.id, z.number().int().parse(id)));
	}
}
