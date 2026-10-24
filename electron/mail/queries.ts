// Reads for the UI: folders with unread counts and message lists.
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Mailbox, MessageBody, MessageQuery, MessageSummary } from '../../src/lib/api';
import { hasRemoteContent } from './body';
import type { Database } from '../db';
import { attachments, mailboxes, messageBodies, messages } from '../db/schema';

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
	return {
		html: body.html,
		text: body.text,
		remoteContent: hasRemoteContent(body.html),
		attachments: files.map((file) => ({ ...file, size: file.size ?? 0 }))
	};
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
