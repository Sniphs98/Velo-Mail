// Message contents: downloaded when a message is opened (or prefetched for the
// newest ones), parsed with postal-mime and stored for offline reading and
// search. Attachments are only listed; their content is fetched again when
// one is opened, so the database stays small.
import { eq } from 'drizzle-orm';
import type { ImapFlow } from 'imapflow';
import PostalMime from 'postal-mime';
import type { Database } from '../db';
import { attachmentText, type AttachmentContent } from './attachment-text';
import { attachments, mailboxes, messageBodies, messages } from '../db/schema';
import { threadKey } from './sync';

/** Larger messages are not downloaded as a whole. */
export const maxMessageSize = 50 * 1024 * 1024;
/** Inline images up to this size are embedded into the stored HTML. */
const maxInlineImage = 2 * 1024 * 1024;

export interface ParsedAttachment {
	/** Position among the message's attachments, used to fetch it again. */
	index: number;
	filename: string | null;
	contentType: string;
	size: number;
	contentId: string | null;
	inline: boolean;
}

export interface ParsedMessage {
	text: string | null;
	html: string | null;
	snippet: string;
	references: string[];
	attachments: ParsedAttachment[];
	/** For the search index (attachment-text.ts). */
	attachmentText: string | null;
	/** An invitation's iCalendar text (itip.ts), if there is one. */
	calendar: string | null;
}

/** Larger calendar parts are not taken for an invitation. */
const maxCalendar = 1024 * 1024;

/** The first text/calendar part with an event in it, e.g. from Outlook or Google. */
function calendarPart(contents: AttachmentContent[]): string | null {
	for (const file of contents) {
		if (!/^(text\/calendar|application\/ics)$/i.test(file.contentType)) continue;
		if (file.content.length > maxCalendar) continue;
		const text = file.content.toString('utf8');
		if (/^BEGIN:VEVENT/m.test(text)) return text;
	}
	return null;
}

function bytes(content: ArrayBuffer | string | Uint8Array): Buffer {
	return typeof content === 'string' ? Buffer.from(content) : Buffer.from(content as ArrayBuffer);
}

export async function parseMessage(source: Buffer): Promise<ParsedMessage> {
	const email = await PostalMime.parse(source, { attachmentEncoding: 'arraybuffer' });

	let html = email.html ?? null;
	const list: ParsedAttachment[] = [];
	const contents: AttachmentContent[] = [];
	email.attachments.forEach((attachment, index) => {
		const content = bytes(attachment.content);
		const contentId = attachment.contentId?.replace(/^<|>$/g, '') ?? null;
		const inline =
			Boolean(
				contentId && attachment.disposition !== 'attachment' && html?.includes(`cid:${contentId}`)
			) ||
			// An invitation's calendar part without a file name is no attachment;
			// the invitation card shows it.
			(!attachment.filename && /^(text\/calendar|application\/ics)$/i.test(attachment.mimeType));
		// Inline images become data: URLs, so the HTML needs no further requests.
		if (
			inline &&
			html &&
			attachment.mimeType.startsWith('image/') &&
			content.length <= maxInlineImage
		) {
			const url = `data:${attachment.mimeType};base64,${content.toString('base64')}`;
			html = html.replaceAll(`cid:${contentId}`, url);
		}
		contents.push({
			filename: attachment.filename,
			contentType: attachment.mimeType,
			content,
			inline
		});
		list.push({
			index,
			filename: attachment.filename,
			contentType: attachment.mimeType,
			size: content.length,
			contentId,
			inline
		});
	});

	const text = email.text?.trim() ? email.text : html ? htmlToText(html) : null;
	return {
		text,
		html,
		snippet: snippet(text ?? ''),
		references: (email.references ?? '').match(/<[^>]+>/g) ?? [],
		attachments: list,
		attachmentText: await attachmentText(contents),
		calendar: calendarPart(contents)
	};
}

const entities: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	auml: 'ä',
	ouml: 'ö',
	uuml: 'ü',
	Auml: 'Ä',
	Ouml: 'Ö',
	Uuml: 'Ü',
	szlig: 'ß',
	euro: '€'
};

/** Readable text from HTML, for search and the preview line. */
export function htmlToText(html: string): string {
	return html
		.replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
			if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
			if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
			return entities[entity] ?? match;
		})
		.replace(/[ \t\f\v\u00a0]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** The first words of the message, without quoted replies. */
export function snippet(text: string, length = 200): string {
	const own = text
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('>'))
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
	return own.length > length ? `${own.slice(0, length - 1).trimEnd()}…` : own;
}

/** True if the HTML loads images or styles from the internet (often tracking). */
export function hasRemoteContent(html: string | null): boolean {
	if (!html) return false;
	return (
		/(?:src|srcset|background)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html) ||
		/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)
	);
}

async function download(client: ImapFlow, uid: number): Promise<Buffer> {
	const result = await client.download(String(uid), undefined, { uid: true });
	if (!result.content) throw new Error('Die Nachricht wurde auf dem Server nicht gefunden.');
	const chunks: Buffer[] = [];
	for await (const chunk of result.content) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks);
}

/** Downloads, parses and stores a message's content. */
export async function fetchBody(
	db: Database,
	client: ImapFlow,
	mailbox: typeof mailboxes.$inferSelect,
	message: typeof messages.$inferSelect
) {
	if ((message.size ?? 0) > maxMessageSize) {
		throw new Error('Die Nachricht ist zu groß, um sie hier anzuzeigen.');
	}
	const lock = await client.getMailboxLock(mailbox.path);
	let source: Buffer;
	try {
		source = await download(client, message.uid);
	} finally {
		lock.release();
	}
	const parsed = await parseMessage(source);

	// node:sqlite is synchronous, so the transaction body is too (run()).
	db.transaction((tx) => {
		tx.insert(messageBodies)
			.values({
				messageId: message.id,
				text: parsed.text,
				html: parsed.html,
				attachmentText: parsed.attachmentText,
				calendar: parsed.calendar
			})
			.onConflictDoUpdate({
				target: messageBodies.messageId,
				set: {
					text: parsed.text,
					html: parsed.html,
					attachmentText: parsed.attachmentText,
					calendar: parsed.calendar,
					fetchedAt: new Date()
				}
			})
			.run();
		tx.update(messages)
			.set({
				snippet: parsed.snippet,
				references: parsed.references,
				threadId: threadKey(parsed.references, message.inReplyTo, message.messageId),
				hasAttachments: parsed.attachments.some((a) => !a.inline)
			})
			.where(eq(messages.id, message.id))
			.run();
		tx.delete(attachments).where(eq(attachments.messageId, message.id)).run();
		if (parsed.attachments.length > 0) {
			tx.insert(attachments)
				.values(
					parsed.attachments.map((a) => ({
						messageId: message.id,
						part: String(a.index),
						filename: a.filename,
						contentType: a.contentType,
						size: a.size,
						contentId: a.contentId,
						inline: a.inline
					}))
				)
				.run();
		}
	});
	return parsed;
}

/** Downloads the message again and returns one attachment's content. */
export async function fetchAttachment(
	client: ImapFlow,
	mailbox: typeof mailboxes.$inferSelect,
	uid: number,
	index: number
): Promise<Buffer> {
	const lock = await client.getMailboxLock(mailbox.path);
	let source: Buffer;
	try {
		source = await download(client, uid);
	} finally {
		lock.release();
	}
	const email = await PostalMime.parse(source, { attachmentEncoding: 'arraybuffer' });
	const attachment = email.attachments[index];
	if (!attachment) throw new Error('Den Anhang gibt es nicht mehr.');
	return bytes(attachment.content);
}
