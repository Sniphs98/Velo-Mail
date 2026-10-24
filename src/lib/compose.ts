// Starting points for writing: replies, reply-to-all and forwards.
import type { ReplySource } from '#lib/api.ts';
import { fullDate } from '#lib/format.ts';

type Address = { name?: string; address: string };

export interface Draft {
	accountId: number;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	text: string;
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

function quote(text: string) {
	return text
		.trimEnd()
		.split('\n')
		.map((line) => (line.startsWith('>') ? `>${line}` : `> ${line}`))
		.join('\n');
}

export function replyDraft(
	source: ReplySource,
	kind: 'reply' | 'replyAll' | 'forward',
	messageId: number
): Draft {
	const own = source.accountEmail.toLowerCase();
	const sender = source.from?.name || source.from?.address || 'unbekannt';
	const base = { accountId: source.accountId, bcc: '' };

	if (kind === 'forward') {
		const header = [
			'---------- Weitergeleitete Nachricht ----------',
			`Von: ${source.from ? formatAddress(source.from) : 'unbekannt'}`,
			`Datum: ${fullDate(source.date)}`,
			`Betreff: ${source.subject}`,
			`An: ${list(source.to)}`
		].join('\n');
		return {
			...base,
			to: '',
			cc: '',
			subject: prefixSubject(source.subject, 'Fwd'),
			text: `\n\n${header}\n\n${source.text.trimEnd()}\n`
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
		text: `\n\nAm ${fullDate(source.date)} schrieb ${sender}:\n${quote(source.text)}\n`,
		replyTo: messageId,
		inReplyTo: source.messageId ?? undefined,
		references: source.messageId ? [...source.references, source.messageId] : source.references
	};
}

/** The signature after the "-- " line that mail apps recognise (RFC 3676). */
export function signatureBlock(signature: string) {
	const text = signature.trimEnd();
	return text ? `-- \n${text}` : '';
}

/** Puts the signature where you write: above a quote or forwarded message. */
export function withSignature(text: string, signature: string) {
	const block = signatureBlock(signature);
	return block ? `\n\n${block}${text}` : text;
}

/**
 * Exchanges the signature when the sender account changes. Only a signature
 * still in the text as inserted is replaced; edited ones stay as they are.
 */
export function swapSignature(text: string, from: string, to: string) {
	const old = signatureBlock(from);
	const next = signatureBlock(to);
	if (old) {
		const at = text.indexOf(old);
		const after = text.slice(at + old.length);
		// Missing, or something was typed onto its last line.
		if (at === -1 || (after && !after.startsWith('\n'))) return text;
		const start = text.slice(at - 2, at) === '\n\n' ? at - 2 : at;
		return text.slice(0, next ? at : start) + next + after;
	}
	// No signature yet: add one if nothing was written above a quote.
	return next && text.startsWith('\n\n') ? withSignature(text, to) : text;
}
