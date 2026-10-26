// Reads for the UI: folders with unread counts and message lists.
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type {
	Mailbox,
	MessageBody,
	MessageQuery,
	MessageSummary,
	SearchQuery
} from '../../src/lib/api';
import { hasRemoteContent } from './body';
import { toFtsQuery } from './search';
import type { Database } from '../db';
import { attachments, mailboxes, messageBodies, messages, trustedSenders } from '../db/schema';

/** Folder order in the sidebar; others follow alphabetically. */
const roleOrder = ['inbox', 'drafts', 'sent', 'archive', 'all', 'junk', 'trash'];

export async function listMailboxes(db: Database): Promise<Mailbox[]> {
	const rows = await db
		.select({
			id: mailboxes.id,
			accountId: mailboxes.accountId,
			name: mailboxes.name,
			role: mailboxes.role,
			unread: sql<number>`count(${messages.id}) filter (where ${messages.seen} = 0)`
		})
		.from(mailboxes)
		.leftJoin(messages, eq(messages.mailboxId, mailboxes.id))
		.groupBy(mailboxes.id);
	const rank = (box: Mailbox) => {
		const i = box.role ? roleOrder.indexOf(box.role) : -1;
		return i === -1 ? roleOrder.length : i;
	};
	return rows.sort(
		(a, b) => a.accountId - b.accountId || rank(a) - rank(b) || a.name.localeCompare(b.name)
	);
}

const summary = {
	id: messages.id,
	accountId: mailboxes.accountId,
	mailboxId: messages.mailboxId,
	fromName: messages.fromName,
	fromAddress: messages.fromAddress,
	to: messages.to,
	subject: messages.subject,
	snippet: messages.snippet,
	date: messages.date,
	seen: messages.seen,
	flagged: messages.flagged,
	hasAttachments: messages.hasAttachments,
	newsletter: sql`coalesce(${messages.newsletter}, 0)`.mapWith(Boolean),
	unsubscribe: messages.unsubscribe
};

/** Messages without a Message-ID form a conversation of their own. */
const threadOf = sql`coalesce(${messages.threadId}, 'id:' || ${messages.id})`;

/**
 * One row per conversation, newest first: its newest message, how many of the
 * listed messages belong to it, and "seen" only if all of them are. The list
 * shows a page; older ones come with scrolling later.
 */
export async function listMessages(
	db: Database,
	query: MessageQuery,
	limit = 500
): Promise<MessageSummary[]> {
	const where =
		'mailboxId' in query
			? eq(messages.mailboxId, query.mailboxId)
			: inArray(
					messages.mailboxId,
					db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.role, 'inbox'))
				);
	const partition = sql`partition by ${mailboxes.accountId}, ${threadOf}`;
	const heads = await db.all<{ id: number; size: number; unseen: number }>(sql`
		select id, size, unseen from (
			select ${messages.id} as id, ${messages.date} as date,
				row_number() over (${partition} order by ${messages.date} desc, ${messages.id} desc) as rn,
				count(*) over (${partition}) as size,
				sum(case when ${messages.seen} then 0 else 1 end) over (${partition}) as unseen
			from ${messages} inner join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId}
			where ${where}
		) where rn = 1 order by date desc, id desc limit ${limit}`);
	if (heads.length === 0) return [];

	const rows = await db
		.select(summary)
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(
			inArray(
				messages.id,
				heads.map((head) => head.id)
			)
		);
	const byId = new Map(rows.map((row) => [row.id, row]));
	return heads.map((head) => {
		const row = byId.get(head.id)!;
		return { ...row, date: row.date.getTime(), seen: head.unseen === 0, threadSize: head.size };
	});
}

/**
 * The whole conversation of a message, oldest first, from all folders of its
 * account (so your own replies from "Gesendet" are part of it). A message
 * stored in two folders appears once.
 */
export async function listThread(db: Database, messageId: number): Promise<MessageSummary[]> {
	const found = await findMessage(db, messageId);
	if (!found) return [];
	const key = found.message.threadId;
	const rows = await db
		.select({ ...summary, messageIdHeader: messages.messageId })
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(
			and(
				eq(mailboxes.accountId, found.mailbox.accountId),
				key ? eq(messages.threadId, key) : eq(messages.id, messageId)
			)
		)
		.orderBy(asc(messages.date), asc(messages.id));
	const seen = new Set<string>();
	return rows
		.filter((row) => {
			if (!row.messageIdHeader) return true;
			if (seen.has(row.messageIdHeader)) return false;
			seen.add(row.messageIdHeader);
			return true;
		})
		.map(({ messageIdHeader, ...row }) => ({
			...row,
			date: row.date.getTime(),
			threadSize: rows.length
		}));
}

/** The message with its folder, for changing flags on the server. */
export async function findMessage(db: Database, id: number) {
	const [row] = await db
		.select({ message: messages, mailbox: mailboxes })
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(eq(messages.id, id));
	return row ?? null;
}

/** The stored content, or null if it has not been downloaded yet. */
export async function findBody(db: Database, messageId: number): Promise<MessageBody | null> {
	const [body] = await db
		.select()
		.from(messageBodies)
		.where(eq(messageBodies.messageId, messageId));
	if (!body) return null;
	const files = await db
		.select({
			id: attachments.id,
			filename: attachments.filename,
			contentType: attachments.contentType,
			size: attachments.size
		})
		.from(attachments)
		.where(and(eq(attachments.messageId, messageId), eq(attachments.inline, false)))
		.orderBy(asc(attachments.id));
	const [message] = await db
		.select({ from: messages.fromAddress })
		.from(messages)
		.where(eq(messages.id, messageId));
	const trusted = message?.from
		? (await db.select().from(trustedSenders).where(eq(trustedSenders.address, message.from)))
				.length > 0
		: false;
	return {
		html: body.html,
		text: body.text,
		remoteContent: hasRemoteContent(body.html),
		trusted,
		attachments: files.map((file) => ({ ...file, size: file.size ?? 0 }))
	};
}

/** Attachments (not inline images) of the message with that UID in a folder. */
export async function attachmentsOf(db: Database, mailboxId: number, uid: number) {
	const rows = await db
		.select({
			id: attachments.id,
			filename: attachments.filename,
			contentType: attachments.contentType,
			size: attachments.size
		})
		.from(attachments)
		.innerJoin(messages, eq(messages.id, attachments.messageId))
		.where(
			and(eq(messages.mailboxId, mailboxId), eq(messages.uid, uid), eq(attachments.inline, false))
		)
		.orderBy(asc(attachments.id));
	return rows.map((row) => ({ ...row, size: row.size ?? 0 }));
}

/** The attachment with its message and folder, for downloading it again. */
export async function findAttachment(db: Database, id: number) {
	const [row] = await db
		.select({ attachment: attachments, message: messages, mailbox: mailboxes })
		.from(attachments)
		.innerJoin(messages, eq(messages.id, attachments.messageId))
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(eq(attachments.id, id));
	return row ?? null;
}

/** The newest messages of a folder whose content is not stored yet. */
export async function withoutBody(db: Database, mailboxId: number, limit: number) {
	return db
		.select({ id: messages.id })
		.from(messages)
		.leftJoin(messageBodies, eq(messageBodies.messageId, messages.id))
		.where(and(eq(messages.mailboxId, mailboxId), isNull(messageBodies.messageId)))
		.orderBy(desc(messages.date))
		.limit(limit);
}

/** Remote images of this sender load without asking from now on. */
export async function trustSender(db: Database, address: string) {
	await db.insert(trustedSenders).values({ address: address.toLowerCase() }).onConflictDoNothing();
}

/** Messages matching the search, newest first, across all accounts and folders. */
/**
 * Messages matching the words (subject, sender, content, attachments) and the
 * filters, across all accounts unless narrowed, newest first.
 */
export async function searchMessages(
	db: Database,
	query: SearchQuery,
	limit = 200
): Promise<MessageSummary[]> {
	const words = [
		toFtsQuery(query.text),
		query.from.trim() ? toFtsQuery(query.from, 'sender') : null
	]
		.filter(Boolean)
		.join(' ');
	const where: SQL[] = [];
	if (words) {
		where.push(
			inArray(messages.id, sql`(select rowid from messages_fts where messages_fts match ${words})`)
		);
	}
	if (query.accounts.length > 0) where.push(inArray(mailboxes.accountId, query.accounts));
	if (query.since !== null) where.push(gte(messages.date, new Date(query.since)));
	if (query.until !== null) where.push(lt(messages.date, new Date(query.until)));
	if (query.attachments) where.push(eq(messages.hasAttachments, true));
	if (query.unread) where.push(eq(messages.seen, false));
	if (query.newsletters === 'only') where.push(eq(messages.newsletter, true));
	if (query.newsletters === 'hide') where.push(sql`coalesce(${messages.newsletter}, 0) = 0`);
	// An empty search lists nothing rather than everything.
	if (where.length === 0) return [];
	const rows = await db
		.select(summary)
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(and(...where))
		.orderBy(desc(messages.date), desc(messages.id))
		.limit(limit);
	return rows.map((row) => ({ ...row, date: row.date.getTime(), threadSize: 1 }));
}

/** The highest UID cached for a mailbox; 0 if it has none. */
export async function newestUid(db: Database, mailboxId: number) {
	const [row] = await db
		.select({ uid: sql<number | null>`max(${messages.uid})` })
		.from(messages)
		.where(eq(messages.mailboxId, mailboxId));
	return row?.uid ?? 0;
}

/** Unread messages above a UID, newest first: the new mail to announce. */
export async function unseenAbove(db: Database, mailboxId: number, uid: number) {
	return db
		.select({
			id: messages.id,
			fromName: messages.fromName,
			fromAddress: messages.fromAddress,
			subject: messages.subject,
			newsletter: sql`coalesce(${messages.newsletter}, 0)`.mapWith(Boolean)
		})
		.from(messages)
		.where(and(eq(messages.mailboxId, mailboxId), gt(messages.uid, uid), eq(messages.seen, false)))
		.orderBy(desc(messages.uid));
}

/** Unread messages in all inboxes, for the badge on the app icon. */
export async function unreadInInboxes(db: Database) {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(and(eq(mailboxes.role, 'inbox'), eq(messages.seen, false)));
	return row?.count ?? 0;
}

/** Machine senders nobody writes to. */
const unanswerable = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.-]|@)/i;

/**
 * People to suggest while typing an address: whoever wrote to one of the
 * accounts, and (counting more) whoever was written to, best match and most
 * frequent first. The accounts' own addresses are left out.
 */
export async function suggestAddresses(
	db: Database,
	input: string,
	own: string[],
	limit = 8
): Promise<{ name?: string; address: string }[]> {
	const text = input.trim().toLowerCase();
	if (!text) return [];
	const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
	const start = like.slice(1);
	const rows = await db.all<{ address: string; name: string | null }>(sql`
		with people(name, address, date, weight) as (
			select ${messages.fromName}, ${messages.fromAddress}, ${messages.date}, 1
				from ${messages} where ${messages.fromAddress} is not null
			union all
			select json_extract(person.value, '$.name'), json_extract(person.value, '$.address'),
				${messages.date}, 3
				from ${messages}
				join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId},
				json_each(${messages.to}) as person
				where ${mailboxes.role} = 'sent'
			union all
			select json_extract(person.value, '$.name'), json_extract(person.value, '$.address'),
				${messages.date}, 3
				from ${messages}
				join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId},
				json_each(${messages.cc}) as person
				where ${mailboxes.role} = 'sent'
		),
		matching as (
			select lower(address) as key, sum(weight) as score, max(date) as last,
				max(lower(address) like ${start} escape '\\' or lower(coalesce(name, '')) like ${start} escape '\\'
					or lower(coalesce(name, '')) like ${'% ' + start} escape '\\') as prefix
			from people
			where address like '%@%'
				and (lower(address) like ${like} escape '\\' or lower(coalesce(name, '')) like ${like} escape '\\')
			group by lower(address)
		)
		select
			(select address from people where lower(address) = matching.key limit 1) as address,
			(select name from people where lower(address) = matching.key and coalesce(name, '') <> ''
				order by date desc limit 1) as name
		from matching
		order by prefix desc, score desc, last desc
		limit ${limit * 2}
	`);
	const mine = new Set(own.map((address) => address.toLowerCase()));
	return rows
		.filter((row) => !mine.has(row.address.toLowerCase()) && !unanswerable.test(row.address))
		.slice(0, limit)
		.map((row) => (row.name ? { name: row.name, address: row.address } : { address: row.address }));
}
