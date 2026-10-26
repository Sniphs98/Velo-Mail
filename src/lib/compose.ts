// Starting points for writing: replies, reply-to-all and forwards.
import { m } from '#lib/paraglide/messages.js';
import type { AttachmentInfo, ReplySource } from '#lib/api.ts';
import { fullDate } from '#lib/format.ts';
import { escapeHtml, quoteHtml, textToHtml } from '#lib/mail-text.ts';

type Address = { name?: string; address: string };

export interface Draft {
	accountId: number;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	/** What the editor holds; the plain-text version is made when sending. */
	html: string;
	/** Attachments of the forwarded message (or of the draft being continued). */
	forwarded: AttachmentInfo[];
	replyTo?: number;
	inReplyTo?: string;
	references?: string[];
	draftUid?: number;
}

export function formatAddress(address: Address): string {
	if (!address.name) return address.address;
	const name = /[,;<>"@]/.test(address.name) ? `"${address.name.replace(/"/g, '')}"` : address.name;
	return `${name} <${address.address}>`;
}

function list(addresses: Address[]) {
	return addresses.map(formatAddress).join(', ');
}

/** "Re: …" or "Fwd: …", without stacking prefixes (also AW:, WG:). */
export function prefixSubject(subject: string, prefix: 'Re' | 'Fwd'): string {
	const pattern = prefix === 'Re' ? /^\s*(re|aw|antw)\s*:/i : /^\s*(fwd?|wg|weitergeleitet)\s*:/i;
	return pattern.test(subject) ? subject : `${prefix}: ${subject}`;
}

export function replyDraft(
	source: ReplySource,
	kind: 'reply' | 'replyAll' | 'forward',
	messageId: number
): Draft {
	const own = source.accountEmail.toLowerCase();
	const sender = source.from?.name || source.from?.address || m.sender_unknown();
	const base = { accountId: source.accountId, bcc: '', forwarded: [] };

	if (kind === 'forward') {
		const header = [
			m.forward_header(),
			`${m.forward_from()}: ${source.from ? formatAddress(source.from) : m.sender_unknown()}`,
			`${m.forward_date()}: ${fullDate(source.date)}`,
			`${m.forward_subject()}: ${source.subject}`,
			`${m.forward_to()}: ${list(source.to)}`
		];
		return {
			...base,
			to: '',
			cc: '',
			subject: prefixSubject(source.subject, 'Fwd'),
			html: `<p>${header.map(escapeHtml).join('<br>')}</p>${textToHtml(source.text)}`,
			forwarded: source.attachments
		};
	}

	const seen = new Set([own]);
	const unique = (addresses: Address[]) =>
		addresses.filter((a) => {
			const key = a.address.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	// Replying to your own message goes to its recipients instead.
	const fromSelf = source.from?.address.toLowerCase() === own;
	let to = unique(fromSelf ? source.to : source.from ? [source.from] : []);
	// A note to yourself is answered to yourself.
	if (to.length === 0 && source.from) to = [source.from];
	const others = kind === 'replyAll' ? unique(fromSelf ? [] : source.to) : [];
	const cc = kind === 'replyAll' ? unique(source.cc) : [];

	return {
		...base,
		to: list([...to, ...others]),
		cc: list(cc),
		subject: prefixSubject(source.subject, 'Re'),
		html: quoteHtml(m.reply_quote({ date: fullDate(source.date), sender }), source.text),
		replyTo: messageId,
		inReplyTo: source.messageId ?? undefined,
		references: source.messageId ? [...source.references, source.messageId] : source.references
	};
}

/** Address, subject and text of a mailto: link (RFC 6068). */
export function parseMailto(url: string): Pick<Draft, 'to' | 'subject' | 'html'> {
	const decode = (value: string) => {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	};
	const link = url.replace(/^mailto:/i, '');
	const mark = link.indexOf('?');
	const target = mark === -1 ? link : link.slice(0, mark);
	const query = mark === -1 ? '' : link.slice(mark + 1);
	// Not URLSearchParams: in mailto: links "+" is a plus, not a space.
	const params = new Map(
		query
			.split('&')
			.filter(Boolean)
			.map((pair) => {
				const equals = pair.indexOf('=');
				const key = equals === -1 ? pair : pair.slice(0, equals);
				const value = equals === -1 ? '' : pair.slice(equals + 1);
				return [key.toLowerCase(), decode(value)] as const;
			})
	);
	return {
		to: [decode(target), params.get('to') ?? ''].filter(Boolean).join(', '),
		subject: params.get('subject') ?? '',
		html: textToHtml(params.get('body') ?? '')
	};
}
