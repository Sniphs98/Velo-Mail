import { describe, expect, it } from 'vitest';
import { samplePdf } from '../testing/sample-pdf';
import { attachmentText, maxChars, pdfText } from './attachment-text';

describe('pdfText', () => {
	it('reads the text of a PDF', async () => {
		expect(await pdfText(samplePdf('Rechnung 4711'))).toBe('Rechnung 4711');
	});

	it('gives nothing for a broken file', async () => {
		expect(await pdfText(Buffer.from('kein PDF'))).toBe('');
	});
});

describe('attachmentText', () => {
	const file = (filename: string, content: Buffer, contentType = 'application/pdf') => ({
		filename,
		contentType,
		content,
		inline: false
	});

	it('lists names and the text of PDFs, not inline images', async () => {
		expect(
			await attachmentText([
				file('rechnung.pdf', samplePdf('Betrag 99 Euro')),
				file('foto.jpg', Buffer.from('jpeg'), 'image/jpeg'),
				{ ...file('logo.png', Buffer.from('png'), 'image/png'), inline: true }
			])
		).toBe('rechnung.pdf\nBetrag 99 Euro\nfoto.jpg');
		expect(await attachmentText([])).toBeNull();
	});

	it('limits how much is kept', async () => {
		const many = Array.from({ length: 30_000 }, (_, i) =>
			file(`datei-${i}.txt`, Buffer.from(''), 'text/plain')
		);
		expect((await attachmentText(many))!.length).toBe(maxChars);
	});
});
