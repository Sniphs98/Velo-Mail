// Turns what the user types into an FTS5 query for messages_fts. Words match
// as prefixes ("plan" finds "Planung"), all words must match, "quoted words"
// match as a phrase, and von:/from: or betreff:/subject: limit a word to the
// sender or the subject. Nothing typed can break the query syntax.

const columns: Record<string, string> = {
	von: 'sender',
	from: 'sender',
	betreff: 'subject',
	subject: 'subject'
};

/** With `column`, every word must match there (e.g. the sender filter). */
export function toFtsQuery(input: string, column?: 'sender' | 'subject'): string | null {
	const parts: string[] = [];
	for (const token of input.match(/(?:\w+:)?"[^"]*"?|\S+/g) ?? []) {
		const field = token.match(/^(\w+):(.*)$/);
		const named = field ? columns[field[1].toLowerCase()] : undefined;
		const term = (named ? field![2] : token).replace(/^"|"$/g, '').trim();
		// Only letters and digits make tokens; the rest separates them.
		if (!/[\p{L}\p{N}]/u.test(term)) continue;
		const phrase = `"${term.replace(/"/g, '""')}"*`;
		const where = column ?? named;
		parts.push(where ? `${where} : ${phrase}` : phrase);
	}
	return parts.length > 0 ? parts.join(' ') : null;
}
