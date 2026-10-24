import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, mailDocument } from './mail-html';

// Runs in the browser project: DOMPurify needs a real DOM.
describe('mailDocument', () => {
	it('removes scripts, event handlers, forms and javascript: links', () => {
		const doc = mailDocument(
			`<p onclick="steal()">Hallo</p><script>alert(1)</script>
			<img src="x" onerror="alert(2)"><a href="javascript:alert(3)">Klick</a>
			<form action="https://phish.example"><input name="pw"></form>
			<iframe src="https://evil.example"></iframe><a href="https://ok.example">ok</a>`,
			{ remote: false }
		);
		expect(doc).toContain('Hallo');
		expect(doc).not.toMatch(/<script|onclick|onerror|javascript:|<form|<input|<iframe/i);
		expect(doc).toContain('href="https://ok.example"');
	});

	it('keeps style blocks and opens links outside the app', () => {
		const doc = mailDocument('<style>.x{color:red}</style><p class="x">Rot</p>', { remote: false });
		expect(doc).toContain('.x{color:red}');
		expect(doc).toContain('<base target="_blank">');
	});

	it('blocks the internet unless allowed', () => {
		expect(mailDocument('<p>x</p>', { remote: false })).toContain(contentSecurityPolicy(false));
		expect(contentSecurityPolicy(false)).not.toContain('https:');
		expect(contentSecurityPolicy(false)).toContain("default-src 'none'");
		expect(contentSecurityPolicy(true)).toContain('img-src data: https:');
	});
});
