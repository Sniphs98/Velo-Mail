import { describe, expect, it } from 'vitest';
import {
	htmlToText,
	quoteHtml,
	signatureHtml,
	swapSignature,
	textToHtml,
	withSignature
} from './mail-text';

describe('textToHtml', () => {
	it('makes paragraphs and line breaks, escaped', () => {
		expect(textToHtml('Hallo <Anna>,\n\nwie geht’s?\nBis bald\n\n\n')).toBe(
			'<p>Hallo &lt;Anna&gt;,</p><p>wie geht’s?<br>Bis bald</p>'
		);
		expect(textToHtml('')).toBe('');
	});
});

describe('htmlToText', () => {
	it('keeps paragraphs, breaks and formatting text', () => {
		expect(htmlToText('<p>Hallo <strong>Anna</strong>,</p><p>Zeile 1<br>Zeile 2</p><p></p>')).toBe(
			'Hallo Anna,\n\nZeile 1\nZeile 2'
		);
	});

	it('writes lists, links and quotes as text', () => {
		const html =
			'<ul><li><p>Brot</p></li><li><p>Milch</p></li></ul>' +
			'<ol><li><p>erst</p></li><li><p>dann</p></li></ol>' +
			'<p><a href="https://velo.example">Velo</a> und <a href="https://x.de">https://x.de</a>' +
			' und <a href="mailto:a@b.de">a@b.de</a></p>' +
			'<blockquote><p>Alt</p><blockquote><p>Älter</p></blockquote></blockquote>';
		expect(htmlToText(html)).toBe(
			'- Brot\n- Milch\n\n1. erst\n2. dann\n\n' +
				'Velo (https://velo.example) und https://x.de und a@b.de\n\n' +
				'> Alt\n>\n> > Älter'
		);
	});
});

describe('signatures', () => {
	it('starts with an empty line, the signature and the quote', () => {
		expect(withSignature('<blockquote><p>Hi</p></blockquote>', 'Viele Grüße\nLukas')).toBe(
			'<p></p><div data-signature="true"><p>-- <br>Viele Grüße<br>Lukas</p></div>' +
				'<blockquote><p>Hi</p></blockquote>'
		);
		expect(withSignature('', ' ')).toBe('<p></p>');
		expect(htmlToText(signatureHtml('Lukas'))).toBe('-- \nLukas');
	});

	it('exchanges the signature when the account changes', () => {
		const html = withSignature('', 'Privat');
		expect(swapSignature(`<p>Hallo</p>${html.slice(7)}`, 'Privat', 'Firma GmbH')).toBe(
			'<p>Hallo</p><div data-signature="true"><p>-- <br>Firma GmbH</p></div>'
		);
		expect(swapSignature(html, 'Privat', '')).toBe('<p></p>');
		expect(swapSignature('<p></p><blockquote><p>Hi</p></blockquote>', '', 'Firma')).toBe(
			'<p></p><div data-signature="true"><p>-- <br>Firma</p></div><blockquote><p>Hi</p></blockquote>'
		);
		expect(swapSignature('<p>Schon geschrieben</p>', '', 'Firma')).toBe('<p>Schon geschrieben</p>');
	});

	it('leaves an edited signature alone', () => {
		const edited = '<p></p><div data-signature="true"><p>-- <br>Privat, Tel. 123</p></div>';
		expect(swapSignature(edited, 'Privat', 'Firma')).toBe(edited);
	});
});

describe('quoteHtml', () => {
	it('quotes the original text below an intro', () => {
		expect(quoteHtml('Am Montag schrieb Anna <a@b.de>:', 'Hi\n\nBis dann')).toBe(
			'<p>Am Montag schrieb Anna &lt;a@b.de&gt;:</p><blockquote><p>Hi</p><p>Bis dann</p></blockquote>'
		);
	});
});
