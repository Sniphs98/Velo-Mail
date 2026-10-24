// Text from attachments for the search index: every attachment's name, and
// what PDFs say (with pdf.js through unpdf). Nothing of it is shown; a broken
// or huge PDF is simply left out.
import { extractText, getDocumentProxy } from 'unpdf';

/** Bigger PDFs are not read; scans of that size rarely hold text anyway. */
export const maxPdfSize = 15 * 1024 * 1024;
/** Per message, so a book-length PDF does not bloat the database. */
export const maxChars = 200_000;
const timeoutMs = 10_000;

export interface AttachmentContent {
	filename: string | null;
	contentType: string;
	content: Buffer;
	inline: boolean;
}

const isPdf = (file: AttachmentContent) =>
	file.contentType === 'application/pdf' || /\.pdf$/i.test(file.filename ?? '');

/** The text of a PDF; empty if it has none or cannot be read in time. */
export async function pdfText(content: Buffer): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const read = async () => {
		const doc = await getDocumentProxy(new Uint8Array(content), {
			verbosity: 0,
			// PDFs come from strangers and this is the main process: nothing from
			// the system or the network, and give up on the first broken part.
			// (pdf.js 5 no longer compiles fonts with eval, see CVE-2024-4367.)
			useSystemFonts: false,
			useWorkerFetch: false,
			stopAtErrors: true
		});
		try {
			const { text } = await extractText(doc, { mergePages: true });
			return text;
		} finally {
			await doc.cleanup();
		}
	};
	try {
		return await Promise.race([
			read(),
			new Promise<string>((resolve) => {
				timer = setTimeout(() => resolve(''), timeoutMs);
			})
		]);
	} catch {
		return '';
	} finally {
		clearTimeout(timer);
	}
}

/** Names and PDF text of the attachments (not inline images); null if there are none. */
export async function attachmentText(files: AttachmentContent[]): Promise<string | null> {
	const listed = files.filter((file) => !file.inline);
	if (listed.length === 0) return null;
	const parts: string[] = [];
	for (const file of listed) {
		if (file.filename) parts.push(file.filename);
		if (isPdf(file) && file.content.length <= maxPdfSize) {
			const text = (await pdfText(file.content)).replace(/\s+/g, ' ').trim();
			if (text) parts.push(text);
		}
	}
	return parts.join('\n').slice(0, maxChars) || null;
}
