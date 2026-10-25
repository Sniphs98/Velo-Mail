// Building outgoing messages: recipients, headers that keep conversations
// together, attachments. The same raw message is sent over SMTP and stored
// in "Gesendet" (or in "Entwürfe" as a draft).
import addressparser from 'nodemailer/lib/addressparser';
import MailComposer from 'nodemailer/lib/mail-composer';
import { z } from 'zod';
import type { OutgoingMessage, ServerSettings } from '../../src/lib/api';

export interface Recipient {
	name?: string;
	address: string;
}

const email = z.email();

/**
 * Parses "Anna <anna@firma.de>, jonas@beispiel.de"; throws with the entry that
 * is not an address, so the UI can say which one.
 */
export function parseRecipients(value: string): Recipient[] {
	const flat = (entries: ReturnType<typeof addressparser>): Recipient[] =>
		entries.flatMap((entry) =>
			'group' in entry && entry.group
				? flat(entry.group)
				: [{ name: entry.name || undefined, address: (entry as { address: string }).address }]
		);
	return flat(addressparser(value)).map((recipient) => {
		if (!email.safeParse(recipient.address).success) {
			throw new Error(`Keine gültige Adresse: ${recipient.address || recipient.name}`);
		}
		return recipient.name ? recipient : { address: recipient.address };
	});
}

/** An attachment taken from a stored message (forwarding, a continued draft). */
export interface StoredFile {
	filename: string | null;
	contentType: string;
	content: Buffer;
}

export interface Built {
	raw: Buffer;
	envelope: { from: string; to: string[] };
	messageId: string;
}

/**
 * The raw message. Drafts keep Bcc in the headers (they are only stored);
 * sent messages carry it in the envelope only.
 */
export async function buildMessage(
	from: Recipient,
	message: OutgoingMessage,
	{
		draft = false,
		stored = [] as StoredFile[],
		calendar
	}: {
		draft?: boolean;
		stored?: StoredFile[];
		/** An iTIP message (e.g. a REPLY), sent as text/calendar alongside the text. */
		calendar?: { method: string; content: string };
	} = {}
): Promise<Built> {
	const to = parseRecipients(message.to);
	const cc = parseRecipients(message.cc);
	const bcc = parseRecipients(message.bcc);
	if (!draft && to.length + cc.length + bcc.length === 0) {
		throw new Error('Die Nachricht hat keinen Empfänger.');
	}
	const mail = new MailComposer({
		from,
		to,
		cc,
		bcc,
		subject: message.subject,
		text: message.text,
		html: message.html || undefined,
		icalEvent: calendar,
		inReplyTo: message.inReplyTo,
		references: message.references,
		attachments: [
			...stored.map((file) => ({
				filename: file.filename ?? 'Anhang',
				content: file.content,
				contentType: file.contentType
			})),
			...message.attachments.map((file) => ({ filename: file.name, path: file.path }))
		],
		date: new Date()
	}).compile();
	mail.keepBcc = draft;
	const raw = await mail.build();
	const envelope = mail.getEnvelope();
	return {
		raw,
		envelope: { from: envelope.from || from.address, to: envelope.to },
		messageId: mail.messageId()
	};
}

/** Gmail stores sent messages itself; appending them too would show them twice. */
export function savesSentCopy(settings: ServerSettings): boolean {
	return /(^|\.)(gmail|googlemail)\.com$/i.test(settings.smtpHost);
}
