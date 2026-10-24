// The composer writes HTML; mails also carry a plain-text version. These
// helpers turn one into the other, and place signatures and quotes.

export function escapeHtml(text: string) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Paragraphs at blank lines, line breaks within them. */
export function textToHtml(text: string) {
	return text
		.replace(/\r\n?/g, '\n')
		.split(/\n{2,}/)
		.filter((paragraph) => paragraph.trim())
		.map(
			(paragraph) =>
				`<p>${escapeHtml(paragraph.replace(/^\n+|\n+$/g, '')).replace(/\n/g, '<br>')}</p>`
		)
		.join('');
}

const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'SECTION']);

/** The plain-text version: lists with dashes or numbers, quotes with "> ", links with their address. */
export function htmlToText(html: string) {
	const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
	return blocksOf(body)
		.join('\n\n')
		.replace(/\u00a0/g, ' ');
}

function blocksOf(parent: Node): string[] {
	const blocks: string[] = [];
	let line = '';
	const flush = () => {
		const text = line.replace(/^\n+|\n+$/g, '');
		if (text.trim()) blocks.push(text);
		line = '';
	};
	const inline = (node: Node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				line += (child.textContent ?? '').replace(/[ \t\r\n]+/g, ' ');
			} else if (child instanceof Element) {
				if (child.tagName === 'BR') {
					line += '\n';
				} else if (blockTags.has(child.tagName)) {
					flush();
					blocks.push(...blocksOf(child));
				} else if (child.tagName === 'UL' || child.tagName === 'OL') {
					flush();
					const items = [...child.children].filter((item) => item.tagName === 'LI');
					blocks.push(
						items
							.map((item, i) => {
								const marker = child.tagName === 'OL' ? `${i + 1}. ` : '- ';
								return marker + blocksOf(item).join('\n').replace(/\n/g, '\n   ');
							})
							.join('\n')
					);
				} else if (child.tagName === 'BLOCKQUOTE') {
					flush();
					const quoted = blocksOf(child).join('\n\n');
					if (quoted) {
						blocks.push(
							quoted
								.split('\n')
								.map((text) => (text ? `> ${text}` : '>'))
								.join('\n')
						);
					}
				} else if (child.tagName === 'A') {
					const before = line;
					line = '';
					inline(child);
					const label = line;
					const href = child.getAttribute('href') ?? '';
					const shown = href.replace(/^mailto:/, '');
					line = before + label + (href && shown !== label.trim() ? ` (${shown})` : '');
				} else {
					inline(child);
				}
			}
		}
	};
	inline(parent);
	flush();
	return blocks;
}

/** The signature as text, after the "-- " line that mail apps recognise (RFC 3676). */
export function signatureBlock(signature: string) {
	const text = signature.trimEnd();
	return text ? `-- \n${text}` : '';
}

/** The signature as a block the editor keeps apart (see editor/signature.ts). */
export function signatureHtml(signature: string) {
	const block = signatureBlock(signature);
	return block ? `<div data-signature="true">${textToHtml(block)}</div>` : '';
}

/** Where a new message starts: an empty line to write in, the signature, then a quote if any. */
export function withSignature(html: string, signature: string) {
	return `<p></p>${signatureHtml(signature)}${html}`;
}

/**
 * Exchanges the signature when the sender account changes. A signature that
 * was edited stays as it is.
 */
export function swapSignature(html: string, from: string, to: string) {
	const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
	const current = body.querySelector('[data-signature]');
	if (current) {
		if (htmlToText(current.innerHTML) !== signatureBlock(from)) return html;
		if (signatureBlock(to)) current.outerHTML = signatureHtml(to);
		else current.remove();
		return body.innerHTML;
	}
	// No signature yet: add one below an empty first line.
	const first = body.firstElementChild;
	if (!signatureBlock(to) || first?.tagName !== 'P' || first.textContent?.trim()) return html;
	first.insertAdjacentHTML('afterend', signatureHtml(to));
	return body.innerHTML;
}

/** "Am … schrieb …:" and the original text as a quote. */
export function quoteHtml(intro: string, text: string) {
	return `<p>${escapeHtml(intro)}</p><blockquote>${textToHtml(text)}</blockquote>`;
}
