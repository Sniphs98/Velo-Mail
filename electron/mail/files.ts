import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Types the system's default app only shows: documents, pictures, audio and
// video. Everything else can be saved but not opened from the app, since a
// block list always misses some type that runs code.
const viewable =
	/\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|txt|csv|tsv|md|log|ics|vcf|rtf|odt|ods|odp|docx?|xlsx?|pptx?|mp3|m4a|wav|ogg|oga|flac|aac|mp4|m4v|mov|webm|mkv)$/i;

// Characters that reorder or hide text, e.g. "rechnung‮fdp.exe" shows as "rechnungexe.pdf".
const invisible = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** A file name that is safe on every system. */
export function safeFilename(name: string | null, contentType: string) {
	const base = path
		.basename(name ?? '')
		.replace(invisible, '')
		// eslint-disable-next-line no-control-regex -- control characters are what it removes
		.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
		.replace(/^\.+/, '')
		.slice(0, 200)
		// Windows drops trailing dots and spaces: "x.exe." would be saved as "x.exe".
		.replace(/[. ]+$/, '');
	// Names Windows reserves for devices.
	const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(base);
	return (
		(reserved ? `_${base}` : base) ||
		`anhang.${contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'}`
	);
}

/** Whether the file may be opened with the system's app; only for names from safeFilename. */
export function canOpen(filename: string) {
	return viewable.test(filename);
}

/**
 * Marks a written file as downloaded from the internet, like browsers do:
 * Windows then shows SmartScreen and opens Office files in Protected View,
 * macOS asks Gatekeeper. Best effort; Linux has no such mark.
 */
export async function markFromInternet(
	file: string,
	platform: NodeJS.Platform = process.platform,
	run: (command: string, args: string[]) => Promise<void> = runQuietly
) {
	try {
		if (platform === 'win32') {
			await writeFile(`${file}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
		} else if (platform === 'darwin') {
			const now = Math.floor(Date.now() / 1000).toString(16);
			await run('xattr', ['-w', 'com.apple.quarantine', `0081;${now};Velo Mail;`, file]);
		}
	} catch {
		// Not on NTFS, or xattr is missing: the file stays as it is.
	}
}

function runQuietly(command: string, args: string[]) {
	return new Promise<void>((resolve, reject) =>
		execFile(command, args, (error) => (error ? reject(error) : resolve()))
	);
}
