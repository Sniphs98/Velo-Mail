// Brings the local cache in line with the server, one mailbox at a time:
// new messages by UID, flag changes (via CONDSTORE when the server has it),
// and messages deleted on the server. Bodies are fetched when a message is
// opened (phase 5).
import { and, eq, inArray, max } from 'drizzle-orm';
import type { FetchMessageObject, ImapFlow, ListResponse } from 'imapflow';
import type { Database } from '../db';
import { mailboxes, messages, type Address } from '../db/schema';

/** Messages fetched per mailbox on the first sync; older ones follow later. */
export const initialLimit = 500;

type Role = NonNullable<(typeof mailboxes.$inferSelect)['role']>;

const roles: Record<string, Role> = {
	'\\Inbox': 'inbox',
	'\\Sent': 'sent',
	'\\Drafts': 'drafts',
	'\\Trash': 'trash',
	'\\Archive': 'archive',
	'\\Junk': 'junk',
	'\\All': 'all'
};

/** Stores the account's folders; returns those that hold messages. */
export async function syncMailboxes(db: Database, accountId: number, client: ImapFlow) {
	const listed = (await client.list()).filter((box) => !box.flags.has('\\Noselect'));
	for (const box of listed) {
		const values = {
			accountId,
			path: box.path,
			name: displayName(box),
			delimiter: box.delimiter,
			role: (box.specialUse && roles[box.specialUse]) || null
		};
		await db
			.insert(mailboxes)
			.values(values)
			.onConflictDoUpdate({
				target: [mailboxes.accountId, mailboxes.path],
				set: { name: values.name, delimiter: values.delimiter, role: values.role }
			});
	}
	// Folders gone from the server go locally too (with their messages).
	const paths = new Set(listed.map((box) => box.path));
	const stored = await db.select().from(mailboxes).where(eq(mailboxes.accountId, accountId));
	const gone = stored.filter((box) => !paths.has(box.path)).map((box) => box.id);
	if (gone.length > 0) await db.delete(mailboxes).where(inArray(mailboxes.id, gone));
	return stored.filter((box) => paths.has(box.path));
}

function displayName(box: ListResponse) {
	return box.specialUse === '\\Inbox' ? 'Posteingang' : box.name;
}

export interface MailboxChanges {
	added: number;
	updated: number;
	removed: number;
}

/** Syncs one mailbox; the caller holds no lock on it. */
export async function syncMailbox(
	db: Database,
	client: ImapFlow,
	mailbox: typeof mailboxes.$inferSelect
): Promise<MailboxChanges> {
	const lock = await client.getMailboxLock(mailbox.path);
	try {
		const opened = client.mailbox;
		if (!opened) throw new Error(`Mailbox ${mailbox.path} did not open`);
		const uidValidity = Number(opened.uidValidity);

		// A new UIDVALIDITY means every UID we know is meaningless.
		if (mailbox.uidValidity !== null && mailbox.uidValidity !== uidValidity) {
			await db.delete(messages).where(eq(messages.mailboxId, mailbox.id));
		}

		const changes = { added: 0, updated: 0, removed: 0 };
		if (opened.exists > 0) {
			changes.added = await fetchNew(db, client, mailbox.id, opened.exists);
			changes.updated = await refreshFlags(db, client, mailbox, uidValidity);
			changes.removed = await removeExpunged(db, client, mailbox.id);
		} else {
			changes.removed = (
				await db.delete(messages).where(eq(messages.mailboxId, mailbox.id)).returning()
			).length;
		}

		await db
			.update(mailboxes)
			.set({
				uidValidity,
				uidNext: opened.uidNext,
				highestModseq: opened.highestModseq?.toString() ?? null,
				lastSyncedAt: new Date()
			})
			.where(eq(mailboxes.id, mailbox.id));
		return changes;
	} finally {
		lock.release();
	}
}

async function fetchNew(db: Database, client: ImapFlow, mailboxId: number, exists: number) {
	const [{ last }] = await db
		.select({ last: max(messages.uid) })
		.from(messages)
		.where(eq(messages.mailboxId, mailboxId));

	// First sync: the newest messages by sequence number. Later: by UID.
	const range = last ? `${last + 1}:*` : `${Math.max(1, exists - initialLimit + 1)}:*`;
	const rows: (typeof messages.$inferInsert)[] = [];
	for await (const message of client.fetch(
		range,
		{
			uid: true,
			flags: true,
			envelope: true,
			internalDate: true,
			size: true,
			bodyStructure: true,
			headers: ['references']
		},
		{ uid: Boolean(last) }
	)) {
		// "n:*" always returns the last message, even if it is older than n.
		if (last && message.uid <= last) continue;
		rows.push(toRow(mailboxId, message));
	}
	for (let i = 0; i < rows.length; i += 200) {
		await db
			.insert(messages)
			.values(rows.slice(i, i + 200))
			.onConflictDoNothing();
	}
	return rows.length;
}

async function refreshFlags(
	db: Database,
	client: ImapFlow,
	mailbox: typeof mailboxes.$inferSelect,
	uidValidity: number
) {
	const known = await db
		.select({ id: messages.id, uid: messages.uid, seen: messages.seen, flagged: messages.flagged })
		.from(messages)
		.where(eq(messages.mailboxId, mailbox.id));
	if (known.length === 0) return 0;
	const byUid = new Map(known.map((m) => [m.uid, m]));

	// With CONDSTORE only what changed since the last sync comes back.
	const condstore = client.mailbox && client.mailbox.highestModseq !== undefined;
	const since =
		condstore && mailbox.highestModseq && mailbox.uidValidity === uidValidity
			? BigInt(mailbox.highestModseq)
			: undefined;

	let updated = 0;
	for await (const message of client.fetch(
		'1:*',
		{ uid: true, flags: true },
		{ uid: true, changedSince: since }
	)) {
		const local = byUid.get(message.uid);
		if (!local) continue;
		const flags = toFlags(message.flags);
		if (flags.seen === local.seen && flags.flagged === local.flagged) continue;
		await db.update(messages).set(flags).where(eq(messages.id, local.id));
		updated++;
	}
	return updated;
}

async function removeExpunged(db: Database, client: ImapFlow, mailboxId: number) {
	const onServer = new Set((await client.search({ all: true }, { uid: true })) || []);
	const local = await db
		.select({ id: messages.id, uid: messages.uid })
		.from(messages)
		.where(eq(messages.mailboxId, mailboxId));
	const gone = local.filter((m) => !onServer.has(m.uid)).map((m) => m.id);
	for (let i = 0; i < gone.length; i += 500) {
		await db.delete(messages).where(inArray(messages.id, gone.slice(i, i + 500)));
	}
	return gone.length;
}

function toFlags(flags: Set<string> | undefined) {
	return {
		seen: flags?.has('\\Seen') ?? false,
		flagged: flags?.has('\\Flagged') ?? false,
		answered: flags?.has('\\Answered') ?? false,
		draft: flags?.has('\\Draft') ?? false
	};
}

function addresses(list: { name?: string; address?: string }[] | undefined): Address[] {
	return (list ?? [])
		.filter((a) => a.address)
		.map((a) => (a.name ? { name: a.name, address: a.address! } : { address: a.address! }));
}

interface Part {
	disposition?: string;
	childNodes?: Part[];
}

function hasAttachment(part: Part | undefined): boolean {
	if (!part) return false;
	if (part.disposition?.toLowerCase() === 'attachment') return true;
	return (part.childNodes ?? []).some(hasAttachment);
}

/** Message-IDs in a References header, oldest first. */
export function parseReferences(headers: Buffer | undefined): string[] {
	if (!headers) return [];
	// Unfold continuation lines, then take the <id> tokens of the References field.
	const text = headers.toString('utf8').replace(/\r?\n[ \t]+/g, ' ');
	const field = text.match(/^references:(.*)$/im)?.[1] ?? '';
	return field.match(/<[^<>\s]+>/g) ?? [];
}

/**
 * The conversation a message belongs to: the first message of its References
 * chain (the thread's root), else the one it replies to, else itself. Works
 * whatever order the messages arrive in, and across folders.
 */
export function threadKey(
	references: string[],
	inReplyTo: string | null | undefined,
	messageId: string | null | undefined
): string | null {
	return references[0] ?? inReplyTo ?? messageId ?? null;
}

export function toRow(
	mailboxId: number,
	message: FetchMessageObject
): typeof messages.$inferInsert {
	const envelope = message.envelope ?? {};
	const references = parseReferences(message.headers);
	const [from] = envelope.from ?? [];
	const date = envelope.date ? new Date(envelope.date) : undefined;
	const internal = message.internalDate ? new Date(message.internalDate) : undefined;
	return {
		mailboxId,
		uid: message.uid,
		messageId: envelope.messageId ?? null,
		inReplyTo: envelope.inReplyTo ?? null,
		references,
		threadId: threadKey(references, envelope.inReplyTo, envelope.messageId),
		subject: envelope.subject ?? '',
		fromName: from?.name || null,
		fromAddress: from?.address?.toLowerCase() ?? null,
		to: addresses(envelope.to),
		cc: addresses(envelope.cc),
		// Some senders write nonsense dates; the server's arrival time is the fallback.
		date: date && !Number.isNaN(date.getTime()) ? date : (internal ?? new Date()),
		size: message.size ?? null,
		hasAttachments: hasAttachment(message.bodyStructure as Part | undefined),
		...toFlags(message.flags)
	};
}

/** Sets or clears \Seen on the server and locally. */
export async function setSeen(
	db: Database,
	client: ImapFlow,
	mailbox: typeof mailboxes.$inferSelect,
	uid: number,
	seen: boolean
) {
	const lock = await client.getMailboxLock(mailbox.path);
	try {
		if (seen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
		else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
	} finally {
		lock.release();
	}
	await db
		.update(messages)
		.set({ seen })
		.where(and(eq(messages.mailboxId, mailbox.id), eq(messages.uid, uid)));
}
