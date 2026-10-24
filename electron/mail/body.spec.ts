import MailComposer from 'nodemailer/lib/mail-composer';
import { describe, expect, it } from 'vitest';
import { hasRemoteContent, htmlToText, parseMessage, snippet } from './body';

function compose(options: ConstructorParameters<typeof MailComposer>[0]): Promise<Buffer> {
	return new MailComposer({
		from: 'Anna Becker <anna@firma.de>',
		to: 'du@beispiel.de',
		subject: 'Test',
		...options
	})
		.compile()
		.build();
}

const pixel = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

describe('parseMessage', () => {
	it('reads plain text and makes a snippet without quoted lines', async () => {
		const parsed = await parseMessage(
			await compose({
				text: 'Hi,\n\npasst für mich so.\n\n> Am Montag schrieb Anna:\n> Alter Text',
				references: '<a@firma.de> <b@firma.de>'
			})
		);
		expect(parsed.text).toContain('passt für mich so.');
		expect(parsed.html).toBeNull();
		expect(parsed.snippet).toBe('Hi, passt für mich so.');
		expect(parsed.references).toEqual(['<a@firma.de>', '<b@firma.de>']);
		expect(parsed.attachments).toEqual([]);
	});

	it('embeds inline images and lists real attachments', async () => {
		const parsed = await parseMessage(
			await compose({
				html: '<p>Logo: <img src="cid:logo@firma"></p>',
				attachments: [
					{ filename: 'logo.png', content: pixel, cid: 'logo@firma' },
					{
						filename: 'Angebot.pdf',
						content: Buffer.from('%PDF-1.4 test'),
						contentType: 'application/pdf'
					}
				]
			})
		);
		expect(parsed.html).toContain('src="data:image/png;base64,');
		expect(parsed.html).not.toContain('cid:');
		expect(parsed.text).toBe('Logo:');
		expect(parsed.attachments).toEqual([
			expect.objectContaining({ index: 0, filename: 'logo.png', inline: true }),
			{
				index: 1,
				filename: 'Angebot.pdf',
				contentType: 'application/pdf',
				size: 13,
				contentId: null,
				inline: false
			}
		]);
	});
});

describe('htmlToText', () => {
	it('drops markup, styles and scripts and decodes entities', () => {
		expect(
			htmlToText(
				'<html><head><style>p{color:red}</style></head><body><p>Grüße &amp; bis&nbsp;bald</p><div>Zweite&#32;Zeile<br>Dritte &#x263A;</div><script>alert(1)</script></body></html>'
			)
		).toBe('Grüße & bis bald\nZweite Zeile\nDritte ☺');
	});
});

describe('snippet', () => {
	it('shortens long text', () => {
		expect(snippet('a '.repeat(300), 20)).toBe('a a a a a a a a a a…');
	});
});

describe('hasRemoteContent', () => {
	it('finds images and styles loaded from the internet', () => {
		expect(hasRemoteContent('<img src="https://track.example/p.gif">')).toBe(true);
		expect(hasRemoteContent("<img src='//cdn.example/x.png'>")).toBe(true);
		expect(hasRemoteContent('<td background="http://x.example/bg.jpg">')).toBe(true);
		expect(hasRemoteContent('<div style="background: url(https://x.example/a.png)">')).toBe(true);
		expect(
			hasRemoteContent('<img src="data:image/png;base64,AAAA"><a href="https://x">Link</a>')
		).toBe(false);
		expect(hasRemoteContent(null)).toBe(false);
	});
});
