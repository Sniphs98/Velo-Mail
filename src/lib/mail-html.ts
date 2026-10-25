// Turns a mail's HTML into a document for a sandboxed iframe: sanitized with
// DOMPurify, no scripts (the iframe's sandbox forbids them anyway), no forms,
// and a content security policy that blocks everything from the internet
// unless the reader allowed remote content for this message.
import DOMPurify from 'dompurify';

const styles = `
	html { color-scheme: light; }
	body { margin: 0; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.6;
		color: #27272a; overflow-wrap: anywhere; }
	img { max-width: 100%; height: auto; }
	table { max-width: 100%; }
	blockquote { margin: 0 0 0 4px; padding-left: 12px; border-left: 3px solid #e4e4e7; color: #52525b; }
	a { color: #18181b; text-underline-offset: 2px; }
`;

export function contentSecurityPolicy(remote: boolean) {
	const internet = remote ? ' https:' : '';
	return [
		"default-src 'none'",
		`img-src data:${internet}`,
		`style-src 'unsafe-inline'${internet}`,
		`font-src data:${internet}`
	].join('; ');
}

export function mailDocument(html: string, { remote }: { remote: boolean }): string {
	const clean = DOMPurify.sanitize(html, {
		FORBID_TAGS: [
			'form',
			'input',
			'button',
			'select',
			'textarea',
			'base',
			'meta',
			'link',
			'iframe'
		],
		FORBID_ATTR: ['action', 'formaction'],
		// Keeps <style> blocks of newsletters; DOMPurify drops what is unsafe.
		FORCE_BODY: true
	});
	return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(remote)}">
<base target="_blank"><style>${styles}</style></head><body>${clean}</body></html>`;
}
