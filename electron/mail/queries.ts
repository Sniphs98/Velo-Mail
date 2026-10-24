// Reads for the UI: folders with unread counts and message lists.
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Mailbox, MessageQuery, MessageSummary } from '../../src/lib/api';
import type { Database } from '../db';
import { mailboxes, messages } from '../db/schema';

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

/** Newest first; the list shows a page, older messages come with scrolling later. */
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
	const rows = await db
		.select({
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
			hasAttachments: messages.hasAttachments
		})
		.from(messages)
		.innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
		.where(where)
		.orderBy(desc(messages.date), desc(messages.id))
		.limit(limit);
	return rows.map((row) => ({ ...row, date: row.date.getTime() }));
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
